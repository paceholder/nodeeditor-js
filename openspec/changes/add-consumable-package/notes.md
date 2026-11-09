# Notes

## Consumer smoke (1.1, 1.2, 1.3)

`node scripts/consumer-smoke.mjs` builds the package, packs it and runs four scenarios in
throwaway projects: the tarball with React (all four entry points import, types ship, `tsc
--noEmit`, `vite build` of core, view and react entries, a core-only bundle without view or
react code, one React runtime), the tarball without React, a linked folder (one React runtime
with the dedupe setting; without it the check fails, which proves the check can fail), and a
git URL pinned to a commit in an empty project.

- 1.1 first run: tarball, no-React and link scenarios passed; the git scenario failed because
  `dist/` was not built on install.
- 1.2 needed: only a `prepare` script (`tsup`) was added. Export map, declarations and peer
  metadata (React 19 optional peer, ESM only) needed no change.
- 1.3 passed: the bundle holds as many React markers as a control bundle without the library,
  and a hook call through the react entry point succeeds; two copies make it fail.
- The git scenario installs a snapshot of the working tree committed in a temporary repository,
  so it checks work that is not committed yet. `npm pack` runs the `prepare` build too.
- The script is plain Node ESM and is excluded from the checked-JavaScript typecheck pass.

## Node versions (2.1)

Checked on Node 20.20.2 (npm 10.9.9): `npm run build` passed, `npm test` passed (148 files, 972
tests) and `node scripts/consumer-smoke.mjs` passed. So `engines` is now Node 20 and later
(`package.json` and its lockfile entry), and the Node baseline in `openspec/config.yaml`,
`AGENTS.md` and `README.md` says Node 20+. No `devEngines` was needed. The browser tests and CI
still run on the Node already installed (CI uses Node 22).

The "Published support and versioning policy" requirement is modified in this change's packaging spec to say Node 20
or later (the owner approved it), and the baseline line in `docs/spec-coverage.md` follows.
Known: CI still runs on Node 22. The tests were run on Node 20 once by hand for this change
(972 tests passed); the library supports Node 20 and later.

## Documentation (3.1, 3.2)

`docs/guide-installing.md` is new and `docs/guide-react.md` states the peer dependency and the
dedupe step. Checked by hand with npm 10.9.9: a git dependency installed with `--omit=dev`
and with `--ignore-scripts` still builds `dist/` (npm builds git packages itself). Other package
managers were not checked.
