/**
 * Image-symbol node painter (PRE-01, AST-01, AST-04).
 *
 * Draws the node's picture to fill its body box in node-local space, so the picture
 * rotates and mirrors with the node exactly as the geometry's anchors do (both use the
 * same node transform). The label is independent of the picture: it is drawn upright
 * below the node's on-screen extent, whatever the rotation. A picture that is still
 * loading draws nothing; one that failed shows the missing-asset placeholder while the
 * node keeps its geometry and ports.
 *
 * Reserve room for the label with the geometry's `paintedMargin` so culling keeps it.
 */
import type { NodeRecord, Payload, Rect } from "../../../core/index.js";
import { drawPlaceholder } from "../primitives/placeholder.js";
import type { NodePainter } from "../registries/painter-types.js";

export interface ImageSymbolPainterOptions {
  /** Asset reference of a node; defaults to a string `asset` field of its payload. */
  readonly assetOf?: (node: NodeRecord) => string | undefined;
  /** Gap between the node extent and its label, in world units. */
  readonly labelGap?: number;
}

export function payloadString(
  payload: Payload,
  key: string,
): string | undefined {
  if (typeof payload !== "object" || payload === null) return undefined;
  if (Array.isArray(payload)) return undefined;
  const v = (payload as { readonly [k: string]: Payload })[key];
  return typeof v === "string" ? v : undefined;
}

/** Context transform: node-local space. Draws text upright under the node's screen box. */
function drawUprightLabel(
  ctx: CanvasRenderingContext2D,
  bounds: Rect<"local">,
  text: string,
  gap: number,
  color: string,
  font: string,
): void {
  const m = ctx.getTransform();
  let maxY = Number.NEGATIVE_INFINITY;
  for (const [x, y] of [
    [bounds.x, bounds.y],
    [bounds.x + bounds.w, bounds.y],
    [bounds.x, bounds.y + bounds.h],
    [bounds.x + bounds.w, bounds.y + bounds.h],
  ] as const) {
    maxY = Math.max(maxY, m.b * x + m.d * y + m.f);
  }
  const cx =
    m.a * (bounds.x + bounds.w / 2) + m.c * (bounds.y + bounds.h / 2) + m.e;
  const scale = Math.hypot(m.a, m.b);
  ctx.save();
  ctx.setTransform(scale, 0, 0, scale, cx, maxY + gap * scale);
  ctx.fillStyle = color;
  ctx.font = font;
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.fillText(text, 0, 0);
  ctx.restore();
}

export function createImageSymbolPainter(
  options: ImageSymbolPainterOptions = {},
): NodePainter {
  const assetOf =
    options.assetOf ?? ((node) => payloadString(node.payload, "asset"));
  const gap = options.labelGap ?? 4;
  return {
    paint(ctx, { node, bounds, style, detail, unit, assets }) {
      const ref = assetOf(node);
      const result = ref ? assets.drawAsset(ref, bounds) : "failed";
      if (result === "failed") {
        drawPlaceholder(ctx, bounds, style, detail, unit, {
          mark: "!",
          label: "missing image",
        });
      }
      if (detail.title && node.title) {
        drawUprightLabel(
          ctx,
          bounds,
          node.title,
          gap,
          style.textColor,
          style.font,
        );
      }
    },
  };
}
