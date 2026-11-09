// Adds the "use client" directive to the built React entry only.
//
// The bundler drops directives found in sources, and tsup can set a banner only for all
// entries together, so the line is prepended after the build. The source map gets one empty
// generated line in front of its mappings so it keeps pointing at the right places.
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const DIRECTIVE = '"use client";\n';

/**
 * Prepends the directive to `<outDir>/react/index.js` and fixes its source map.
 * @param {string} outDir
 * @returns {Promise<void>}
 */
export async function addClientDirective(outDir) {
  const file = join(outDir, "react", "index.js");
  const code = await readFile(file, "utf8");
  if (code.startsWith(DIRECTIVE)) return;
  await writeFile(file, DIRECTIVE + code);
  const mapFile = `${file}.map`;
  const map = JSON.parse(await readFile(mapFile, "utf8"));
  map.mappings = `;${map.mappings}`;
  await writeFile(mapFile, JSON.stringify(map));
}
