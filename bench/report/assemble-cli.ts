/** Entry of `npm run bench:baseline`'s last step: .results/ to baseline/ (bundled by esbuild). */
import { fileURLToPath } from "node:url";
import { assemble } from "./assemble.js";
import { writeBaseline } from "./write-baseline.js";

const root = fileURLToPath(new URL("../../", import.meta.url));
const date = new Date().toISOString().slice(0, 10);
const baseline = assemble(`${root}bench/.results`, date);
const file = writeBaseline(`${root}bench/baseline`, baseline);
console.log(`baseline written: ${file}`);
