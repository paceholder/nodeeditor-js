// Consumer smoke (consumable build, one import path per public name, one React copy): proves the built package installs and builds in
// fresh projects the way a host would use it. Not part of `npm test`; run it with
//   node scripts/consumer-smoke.mjs
// Scenarios, each in a throwaway project under the system temp folder:
//   1. packed tarball with React: imports all four entry points, vite build, tsc --noEmit,
//      a core-only bundle without view or react code, one React runtime in a bundle
//   2. packed tarball without React: core and view install, import and build
//   3. linked folder with the host's dedupe setting: one React runtime; without the setting
//      two copies appear (a control that shows the check can fail)
//   4. git URL pinned to a commit into an empty project: the install-time build produces
//      dist/ and every entry point imports with types
// The git scenario installs a snapshot of the working tree (tracked and untracked files
// that are not ignored), committed in a temporary repository, so it checks uncommitted work.
import { execFileSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const template = join(root, "examples", "consumer-smoke");
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const dev = pkg.devDependencies;
const work = mkdtempSync(join(tmpdir(), "nodeeditor-consumer-smoke-"));

const failures = [];
function check(label, fn) {
  try {
    fn();
    console.log(`  ok    ${label}`);
  } catch (error) {
    failures.push(label);
    console.log(
      `  FAIL  ${label}\n        ${String(error.message).split("\n")[0]}`,
    );
  }
}

function run(command, args, cwd, env = {}) {
  return execFileSync(command, args, {
    cwd,
    env: { ...process.env, ...env },
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

const toolVersions = {
  vite: dev.vite,
  typescript: dev.typescript,
};
const reactVersions = {
  react: dev.react,
  "react-dom": dev["react-dom"],
  "@types/react": dev["@types/react"],
  "@types/react-dom": dev["@types/react-dom"],
};

function newProject(name, dependencies, { copyTemplate = true } = {}) {
  const dir = join(work, name);
  mkdirSync(dir, { recursive: true });
  if (copyTemplate) cpSync(template, dir, { recursive: true });
  writeFileSync(
    join(dir, "package.json"),
    JSON.stringify(
      { name, private: true, type: "module", dependencies },
      null,
      2,
    ),
  );
  return dir;
}

function install(dir) {
  run("npm", ["install", "--no-audit", "--no-fund", "--loglevel=error"], dir);
}

function importProbe(dir, specifiers) {
  const source = `
    const expected = ${JSON.stringify(specifiers)};
    for (const [specifier, name] of Object.entries(expected)) {
      const module = await import(specifier);
      if (typeof module[name] !== "function") throw new Error(specifier + " lacks " + name);
    }`;
  run("node", ["--input-type=module", "-e", source], dir);
}

const entryNames = {
  "@paceholder/nodeeditor-js": "createGraphModel",
  "@paceholder/nodeeditor-js/view": "mountView",
  "@paceholder/nodeeditor-js/view/advanced": "createFrameScheduler",
  "@paceholder/nodeeditor-js/react": "NodeEditor",
};
const withoutReact = Object.fromEntries(
  Object.entries(entryNames).filter(
    ([specifier]) => specifier !== "@paceholder/nodeeditor-js/react",
  ),
);

function viteBuild(dir, entry, out, env = {}) {
  run("npx", ["vite", "build"], dir, {
    SMOKE_ENTRY: entry,
    SMOKE_OUT: out,
    ...env,
  });
}

function read(dir, file) {
  return readFileSync(join(dir, file), "utf8");
}

function marker(text) {
  return text.split("react.transitional.element").length - 1;
}

function checkEntryTypes(dir) {
  const base = join(dir, "node_modules", "@paceholder/nodeeditor-js", "dist");
  for (const file of [
    "core/index",
    "view/index",
    "view/advanced",
    "react/index",
  ]) {
    if (
      !existsSync(join(base, `${file}.js`)) ||
      !existsSync(join(base, `${file}.d.ts`))
    ) {
      throw new Error(`dist/${file}.js or .d.ts missing`);
    }
  }
}

function singleReactChecks(dir, dedupe) {
  const env = { SMOKE_SSR: "1", SMOKE_DEDUPE: dedupe ? "1" : "0" };
  viteBuild(dir, "entry-ssr-control.tsx", "out-control", env);
  const control = marker(read(dir, "out-control/entry-ssr-control.js"));
  if (control < 1) throw new Error("the control bundle holds no React marker");
  viteBuild(dir, "entry-ssr.tsx", "out-ssr", env);
  const copies = marker(read(dir, "out-ssr/entry-ssr.js"));
  if (copies !== control) {
    throw new Error(
      `bundle holds ${copies} React markers, one runtime holds ${control}`,
    );
  }
  const output = run("node", ["out-ssr/entry-ssr.js"], dir).trim();
  if (output !== "react-ok") throw new Error(`hook render printed: ${output}`);
}

try {
  console.log("build");
  run("npm", ["run", "build"], root);
  // npm pack runs the prepare script, whose output precedes the JSON report.
  const packOutput = run(
    "npm",
    ["pack", "--json", "--pack-destination", work],
    root,
  );
  const packed = JSON.parse(
    packOutput.slice(packOutput.lastIndexOf("\n[") + 1),
  );
  const tarball = join(work, packed[0].filename);

  console.log("packed tarball with React");
  const withReact = newProject("tarball-react", {
    "@paceholder/nodeeditor-js": `file:${tarball}`,
    ...toolVersions,
    ...reactVersions,
  });
  install(withReact);
  check("all four entry points import", () =>
    importProbe(withReact, entryNames),
  );
  check("types ship for every entry point", () => checkEntryTypes(withReact));
  check("tsc --noEmit", () =>
    run("npx", ["tsc", "--noEmit", "-p", "tsconfig.json"], withReact),
  );
  for (const [entry, out] of [
    ["entry-core.ts", "out-core"],
    ["entry-view.ts", "out-view"],
    ["entry-react.tsx", "out-react"],
  ]) {
    check(`vite build ${entry}`, () => viteBuild(withReact, entry, out));
  }
  check("core-only bundle holds no view or react code", () => {
    const text = read(withReact, "out-core/bundle.js");
    for (const forbidden of [
      "getContext",
      "react.transitional.element",
      "addEventListener",
    ]) {
      if (text.includes(forbidden))
        throw new Error(`core bundle contains ${forbidden}`);
    }
  });
  check("one React runtime from the tarball", () =>
    singleReactChecks(withReact, false),
  );

  console.log("packed tarball without React");
  const noReact = newProject("tarball-no-react", {
    "@paceholder/nodeeditor-js": `file:${tarball}`,
    ...toolVersions,
  });
  install(noReact);
  check("core and view entry points import", () =>
    importProbe(noReact, withoutReact),
  );
  check("tsc --noEmit", () =>
    run("npx", ["tsc", "--noEmit", "-p", "tsconfig.noreact.json"], noReact),
  );
  for (const [entry, out] of [
    ["entry-core.ts", "out-core"],
    ["entry-view.ts", "out-view"],
  ]) {
    check(`vite build ${entry}`, () => viteBuild(noReact, entry, out));
  }

  console.log("linked folder");
  const linked = newProject("linked", {
    "@paceholder/nodeeditor-js": `file:${root}`,
    ...toolVersions,
    ...reactVersions,
  });
  install(linked);
  check("one React runtime with the dedupe setting", () =>
    singleReactChecks(linked, true),
  );
  check(
    "control: two React copies without the dedupe setting are detected",
    () => {
      try {
        singleReactChecks(linked, false);
      } catch {
        return;
      }
      throw new Error("expected the check to fail without dedupe, it passed");
    },
  );

  console.log("git URL pinned to a commit");
  const snapshot = join(work, "git-source");
  mkdirSync(snapshot);
  const files = run(
    "git",
    ["ls-files", "-co", "--exclude-standard", "-z"],
    root,
  )
    .split("\0")
    .filter((file) => file !== "" && existsSync(join(root, file)));
  for (const file of files) {
    const target = join(snapshot, file);
    mkdirSync(dirname(target), { recursive: true });
    cpSync(join(root, file), target);
  }
  const git = (...args) =>
    run(
      "git",
      [
        "-c",
        "user.name=smoke",
        "-c",
        "user.email=smoke@example.invalid",
        ...args,
      ],
      snapshot,
    );
  git("init", "--quiet");
  git("add", "-A");
  git("commit", "--quiet", "-m", "snapshot");
  const sha = git("rev-parse", "HEAD").trim();
  const fromGit = newProject(
    "git-empty",
    {
      "@paceholder/nodeeditor-js": `git+file://${snapshot}#${sha}`,
      react: reactVersions.react,
      "react-dom": reactVersions["react-dom"],
    },
    { copyTemplate: false },
  );
  install(fromGit);
  check("install-time build produced dist with types", () =>
    checkEntryTypes(fromGit),
  );
  check("all four entry points import", () => importProbe(fromGit, entryNames));
} finally {
  if (process.env.SMOKE_KEEP === "1") console.log(`kept ${work}`);
  else rmSync(work, { recursive: true, force: true });
}

if (failures.length > 0) {
  console.log(`\n${failures.length} check(s) failed`);
  process.exit(1);
}
console.log("\nconsumer smoke passed");
