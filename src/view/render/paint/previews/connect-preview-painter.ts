/**
 * Connect preview painter (D7): the provisional path, a capture
 * ring and a state glyph on every candidate port, and the policy's reason next to the
 * hovered candidate. Ring and glyph sizes are CSS pixels, so the capture radius looks the
 * same at every zoom and device pixel ratio. Context starts in world space.
 */
import {
  type ConnectionRouter,
  DEFAULT_CAPTURE_RADIUS_PX,
  type Endpoint,
  type GeometryScene,
  type Point,
  type WorldAnchor,
  worldToViewport,
} from "../../../../core/index.js";
import type { PaintFrame } from "../../primitives/frame.js";
import { setMatrix } from "../../primitives/frame.js";
import { tracePath } from "../../primitives/trace-path.js";
import { colorOf, drawGlyph, GLYPH_RADIUS_PX } from "./connect-glyphs.js";
import type { ToolPreview } from "./preview-types.js";

type ConnectPreview = Extract<ToolPreview, { kind: "connect" }>;

function anchorOf(
  scene: Pick<GeometryScene, "node">,
  e: Endpoint,
): WorldAnchor | undefined {
  return scene.node(e.node)?.anchors.find((a) => a.portId === e.port);
}

/**
 * The provisional path, routed with the default router: the connection's kind is
 * decided only at commit. A free end has no body and a normal facing back
 * toward the source, which gives a smooth curve or an L or S that follows the pointer.
 */
function pathTo(
  router: ConnectionRouter,
  scene: Pick<GeometryScene, "node">,
  preview: ConnectPreview,
  source: WorldAnchor,
  end: WorldAnchor | undefined,
) {
  const from = {
    position: source.position,
    normal: source.normal,
    body: scene.node(preview.source.node)?.bodyBounds,
  };
  if (end && preview.target) {
    const body = scene.node(preview.target.node)?.bodyBounds;
    return router.route({ from, to: { ...end, body }, constraints: [] }).path;
  }
  const pointer = preview.pointer;
  const dx = source.position.x - pointer.x;
  const dy = source.position.y - pointer.y;
  const len = Math.hypot(dx, dy) || 1;
  const normal = { x: dx / len, y: dy / len };
  return router.route({
    from,
    to: { position: pointer, normal, body: undefined },
    constraints: [],
  }).path;
}

/** Text next to the glyph: on the side the port faces. */
function drawReason(
  ctx: CanvasRenderingContext2D,
  text: string,
  color: string,
  frame: PaintFrame,
  normal: Point<"world">,
): void {
  ctx.font = "12px system-ui, sans-serif";
  ctx.textBaseline = "middle";
  const padding = 5;
  const width = ctx.measureText(text).width + 2 * padding;
  const side = normal.x < 0 ? -1 : 1;
  const x0 = side > 0 ? GLYPH_RADIUS_PX + 4 : -GLYPH_RADIUS_PX - 4 - width;
  ctx.fillStyle = frame.theme.background;
  ctx.globalAlpha = 0.92;
  ctx.fillRect(x0, -9, width, 18);
  ctx.globalAlpha = 1;
  ctx.lineWidth = 1;
  ctx.strokeStyle = color;
  ctx.strokeRect(x0, -9, width, 18);
  ctx.fillStyle = frame.theme.textColor;
  ctx.textAlign = "left";
  ctx.fillText(text, x0 + padding, 0.5);
}

export function paintConnectPreview(
  ctx: CanvasRenderingContext2D,
  scene: Pick<GeometryScene, "node">,
  router: ConnectionRouter,
  frame: PaintFrame,
  preview: ConnectPreview,
): void {
  const { theme, viewport } = frame;
  const unit = 1 / viewport.zoom;
  const source = anchorOf(scene, preview.source);
  if (!source) return;
  const end = preview.target ? anchorOf(scene, preview.target) : undefined;

  const path = pathTo(router, scene, preview, source, end);
  ctx.lineCap = "round";
  ctx.lineWidth = theme.connectionWidth * unit;
  ctx.strokeStyle = theme.connectionColor;
  // A dashed provisional wire reads as "not committed" without relying on color.
  ctx.setLineDash([6 * unit, 4 * unit]);
  ctx.beginPath();
  tracePath(ctx, path);
  ctx.stroke();
  ctx.setLineDash([]);

  setMatrix(ctx, frame.viewportToDevice);
  preview.candidates.forEach((c, i) => {
    const a = anchorOf(scene, c.endpoint);
    if (!a) return;
    const { state, occupiedMark, reason } = c.evaluation;
    const color = colorOf(state, theme);
    const at = worldToViewport(viewport, a.position);
    ctx.save();
    ctx.translate(at.x, at.y);
    // Capture ring: the pick radius in CSS pixels.
    ctx.beginPath();
    ctx.arc(
      0,
      0,
      a.captureRadiusPx || DEFAULT_CAPTURE_RADIUS_PX,
      0,
      Math.PI * 2,
    );
    ctx.globalAlpha = i === 0 ? 0.9 : 0.4;
    ctx.lineWidth = 1;
    ctx.strokeStyle = color;
    ctx.stroke();
    ctx.globalAlpha = 1;
    // The badge sits outside the node, on the port's outward side.
    const off =
      (a.captureRadiusPx || DEFAULT_CAPTURE_RADIUS_PX) + GLYPH_RADIUS_PX - 2;
    ctx.translate(a.normal.x * off, a.normal.y * off);
    drawGlyph(ctx, state, color, theme.background, occupiedMark);
    if (i === 0 && reason) drawReason(ctx, reason, color, frame, a.normal);
    ctx.restore();
  });
}
