/**
 * Generic picture assets for the image-symbol fixture nodes (`payload.asset` is
 * `symbol-0` .. `symbol-7`). Plain line drawings of a generic schematic style, produced
 * in code so the benchmark and the demo need no static files.
 */
import type { AssetSource } from "nodeeditor-js/view";

const INK = "#aab6c8";
const W = 80;
const H = 56;

/** Shape bodies drawn in an 80x56 box; every one leaves the left and right edges open. */
const BODIES: readonly string[] = [
  // circle with a cross (generic rotating machine)
  `<circle cx="40" cy="28" r="22"/><path d="M24 12 56 44M56 12 24 44"/>`,
  // bow-tie (generic valve)
  `<path d="M12 8 68 48V8L12 48Z"/>`,
  // rectangle with a wave (generic vessel)
  `<rect x="10" y="6" width="60" height="44" rx="6"/><path d="M16 28q6-10 12 0t12 0 12 0 12 0"/>`,
  // triangle (generic amplifier)
  `<path d="M14 6V50L68 28Z"/>`,
  // rectangle with a diagonal (generic exchanger)
  `<rect x="10" y="10" width="60" height="36"/><path d="M10 46 70 10"/>`,
  // double circle (generic source)
  `<circle cx="30" cy="28" r="18"/><circle cx="50" cy="28" r="18"/>`,
  // hexagon (generic tank)
  `<path d="M24 6H56L72 28 56 50H24L8 28Z"/>`,
  // rectangle with ticks (generic resistive element)
  `<rect x="10" y="16" width="60" height="24"/><path d="M22 16V40M34 16V40M46 16V40M58 16V40"/>`,
];

export const SYMBOL_COUNT = BODIES.length;

export function symbolSvg(index: number): string {
  const body = BODIES[index % BODIES.length] ?? "";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" fill="none" stroke="${INK}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round">${body}</svg>`;
}

/** Asset resolver for the fixture refs; resolves from memory, never fetches. */
export function resolveFixtureAsset(ref: string): Promise<AssetSource> {
  const match = /^symbol-(\d+)$/.exec(ref);
  if (!match) return Promise.reject(new Error(`unknown asset ${ref}`));
  return Promise.resolve({ kind: "svg", text: symbolSvg(Number(match[1])) });
}
