/**
 * SVG screening. Imported markup is untrusted: before an SVG is decoded
 * it is parsed and rejected when it holds anything active or anything that would fetch.
 * A host that needs more can resolve assets through its own sanitizer; this is the
 * built-in policy. Needs `DOMParser`, so it runs in the browser only.
 *
 * The real isolation is how SVG is decoded: only through an image element (`decode.ts`),
 * and browsers run no script and fetch no resource for SVG used as an image. This screen
 * is a second layer on top of that, not a sanitizer for SVG placed in the document.
 */

export interface SvgInfo {
  /** Re-serialized markup with explicit `width` and `height`. */
  readonly text: string;
  readonly width: number;
  readonly height: number;
}

export interface SvgViolation {
  readonly reason: string;
}

export type SvgScreen =
  | { readonly ok: true; readonly value: SvgInfo }
  | { readonly ok: false; readonly rejection: SvgViolation };

const FORBIDDEN_ELEMENTS: ReadonlySet<string> = new Set([
  "script",
  "foreignobject",
  "iframe",
  "object",
  "embed",
  "audio",
  "video",
  "link",
  "meta",
  "base",
  "handler",
  "listener",
]);

const DEFAULT_SIDE = 100;
/** Longest intrinsic side kept; larger declared sizes are scaled down to it. */
export const MAX_SVG_SIDE = 4096;

const bad = (reason: string): SvgScreen => ({
  ok: false,
  rejection: { reason },
});

/** True when `value` is a reference that stays inside the document or is inline image data. */
function isLocalRef(value: string): boolean {
  const v = value.trim().toLowerCase();
  return v.startsWith("#") || v.startsWith("data:image/");
}

/** Every `url(...)` target in a CSS or attribute value must be a fragment reference. */
function hasExternalUrl(value: string): boolean {
  for (const m of value.matchAll(/url\(\s*(['"]?)([^'")]*)\1\s*\)/gi)) {
    if (!(m[2] ?? "").trim().startsWith("#")) return true;
  }
  return /@import/i.test(value);
}

/** Animations that could rewrite a link attribute after screening. */
const ANIMATIONS: ReadonlySet<string> = new Set(["set", "animate"]);
const LINK_ATTRIBUTES: ReadonlySet<string> = new Set(["href", "xlink:href"]);

function violationOf(el: Element): string | undefined {
  const name = el.localName.toLowerCase();
  if (FORBIDDEN_ELEMENTS.has(name)) return `element <${name}> is not allowed`;
  const animated = (el.getAttribute("attributeName") ?? "")
    .trim()
    .toLowerCase();
  if (ANIMATIONS.has(name) && LINK_ATTRIBUTES.has(animated)) {
    return `element <${name}> animates a link attribute`;
  }
  if (name === "style" && hasExternalUrl(el.textContent ?? "")) {
    return "style element references an external resource";
  }
  for (const attr of Array.from(el.attributes)) {
    const attrName = attr.name.toLowerCase();
    if (attrName.startsWith("on")) return `event attribute "${attr.name}"`;
    if (
      (attrName === "href" || attrName === "xlink:href") &&
      !isLocalRef(attr.value)
    ) {
      return `external reference in "${attr.name}"`;
    }
    if (hasExternalUrl(attr.value)) {
      return `external url() in "${attr.name}"`;
    }
  }
  return undefined;
}

function lengthOf(raw: string | null): number | undefined {
  if (!raw || raw.includes("%")) return undefined;
  const n = Number.parseFloat(raw);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

/**
 * The intrinsic size: `width`/`height`, else the `viewBox`, else a default, scaled down
 * (keeping the aspect) so the longer side is at most `MAX_SVG_SIDE`. A declared size has
 * no upper bound otherwise, and it decides the bitmap sizes the cache rasterizes.
 */
function sizeOf(svg: Element): {
  width: number;
  height: number;
  declared: { width: number; height: number };
} {
  const vb = (svg.getAttribute("viewBox") ?? "")
    .trim()
    .split(/[\s,]+/)
    .map(Number);
  const vbw = vb.length === 4 && (vb[2] ?? 0) > 0 ? vb[2] : undefined;
  const vbh = vb.length === 4 && (vb[3] ?? 0) > 0 ? vb[3] : undefined;
  const width = lengthOf(svg.getAttribute("width")) ?? vbw ?? DEFAULT_SIDE;
  const height = lengthOf(svg.getAttribute("height")) ?? vbh ?? DEFAULT_SIDE;
  const scale = Math.min(1, MAX_SVG_SIDE / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
    declared: { width, height },
  };
}

/**
 * Screen SVG text. On success the returned markup is the re-serialized document with
 * explicit pixel size, which is what gets decoded (so a parser quirk cannot differ
 * between what was checked and what is decoded).
 */
export function screenSvg(text: string, maxChars = 1 << 20): SvgScreen {
  if (text.length > maxChars) return bad("SVG exceeds the size limit");
  if (/<!ENTITY/i.test(text)) return bad("entity declarations are not allowed");
  const doc = new DOMParser().parseFromString(text, "image/svg+xml");
  const root = doc.documentElement;
  if (doc.getElementsByTagName("parsererror").length > 0) {
    return bad("SVG is not well-formed");
  }
  if (root.localName.toLowerCase() !== "svg") return bad("root is not <svg>");
  for (const el of [root, ...Array.from(root.querySelectorAll("*"))]) {
    const reason = violationOf(el);
    if (reason) return bad(reason);
  }
  const { declared, ...size } = sizeOf(root);
  // A scaled-down size needs a viewBox, or the picture would be cropped, not scaled.
  if (
    !root.hasAttribute("viewBox") &&
    (size.width !== declared.width || size.height !== declared.height)
  ) {
    root.setAttribute("viewBox", `0 0 ${declared.width} ${declared.height}`);
  }
  root.setAttribute("width", String(size.width));
  root.setAttribute("height", String(size.height));
  if (!root.hasAttribute("xmlns")) {
    root.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  }
  return {
    ok: true,
    value: { text: new XMLSerializer().serializeToString(root), ...size },
  };
}
