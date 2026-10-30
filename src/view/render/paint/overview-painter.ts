/**
 * Overview painting (D3).
 *
 * Below the theme's `lodOverviewBelow` the scene layer calls no node or connection
 * painters. Nodes are drawn as their hit bounds, added to one path per resolved style
 * (fill, stroke, line width) and filled and stroked once. Connections are added to one
 * path per resolved stroke style and stroked once, and a cubic only a few pixels long on
 * screen becomes a line. Paths still end at the port anchors.
 *
 * Selection outlines and diagnostic badges are drawn per entity after each layer's
 * batches, so they always sit on top. Canvas state is set once per batch, with one
 * save/restore per layer and none per entity. Batches keep first-seen order over the
 * paint-ordered entry list, so the output is deterministic.
 */
import {
  type ConnectionEntry,
  compose,
  type NodeEntry,
  type PathGeometry,
  transformRect,
} from "../../../core/index.js";
import { type PaintFrame, setMatrix } from "../primitives/frame.js";
import { tracePath } from "../primitives/trace-path.js";
import { type ResolvedStyle, resolveStyle } from "../theme/resolve-style.js";
import {
  diagnosticsOf,
  drawConnectionSelection,
  drawNodeBadges,
  drawNodeSelection,
} from "./decorations.js";

/** A cubic whose control polygon is shorter than this on screen (CSS px) is a line. */
const LINE_BELOW_PX = 3;

export interface OverviewState {
  isSelected(id: string): boolean;
}

interface Batch<T> {
  readonly style: ResolvedStyle;
  readonly items: T[];
}

/** Group entries by a style key, keeping first-seen order of keys and entries. */
function batches<T>(
  list: readonly T[],
  styleOf: (entry: T) => ResolvedStyle | undefined,
  keyOf: (style: ResolvedStyle) => string,
): Batch<T>[] {
  const byKey = new Map<string, Batch<T>>();
  const out: Batch<T>[] = [];
  for (const entry of list) {
    const style = styleOf(entry);
    if (!style) continue;
    const key = keyOf(style);
    let batch = byKey.get(key);
    if (!batch) {
      batch = { style, items: [] };
      byKey.set(key, batch);
      out.push(batch);
    }
    batch.items.push(entry);
  }
  return out;
}

function polygonLength(p: Extract<PathGeometry, { kind: "cubic" }>): number {
  return (
    Math.hypot(p.c1.x - p.p0.x, p.c1.y - p.p0.y) +
    Math.hypot(p.c2.x - p.c1.x, p.c2.y - p.c1.y) +
    Math.hypot(p.p1.x - p.c2.x, p.p1.y - p.c2.y)
  );
}

function traceSimplified(
  ctx: CanvasRenderingContext2D,
  path: PathGeometry,
  zoom: number,
): void {
  if (path.kind === "cubic" && polygonLength(path) * zoom < LINE_BELOW_PX) {
    ctx.moveTo(path.p0.x, path.p0.y);
    ctx.lineTo(path.p1.x, path.p1.y);
    return;
  }
  tracePath(ctx, path);
}

/** Context transform on return: unchanged (one save/restore around the layer). */
export function paintOverviewConnections(
  ctx: CanvasRenderingContext2D,
  frame: PaintFrame,
  list: readonly ConnectionEntry[],
  state: OverviewState,
  unit: number,
): void {
  const zoom = frame.viewport.zoom;
  ctx.save();
  setMatrix(ctx, frame.worldToDevice);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  const groups = batches(
    list,
    (e) =>
      e.path
        ? resolveStyle(frame.theme, { type: e.record.kind, id: e.id })
        : undefined,
    (s) => `${s.connectionColor}|${s.connectionWidth}`,
  );
  for (const { style, items } of groups) {
    ctx.beginPath();
    for (const e of items) if (e.path) traceSimplified(ctx, e.path, zoom);
    ctx.lineWidth = style.connectionWidth * unit;
    ctx.strokeStyle = style.connectionColor;
    ctx.stroke();
  }
  for (const e of list) {
    if (e.path && state.isSelected(e.id))
      drawConnectionSelection(ctx, e.path, frame.theme, unit);
  }
  ctx.restore();
}

/** Context transform on return: unchanged (one save/restore around the layer). */
export function paintOverviewNodes(
  ctx: CanvasRenderingContext2D,
  frame: PaintFrame,
  list: readonly NodeEntry[],
  state: OverviewState,
  unit: number,
): void {
  ctx.save();
  setMatrix(ctx, frame.worldToDevice);
  const groups = batches(
    list,
    (e) => resolveStyle(frame.theme, { type: e.record.type, id: e.id }),
    (s) => `${s.nodeFill}|${s.nodeStroke}|${s.nodeLineWidth}`,
  );
  for (const { style, items } of groups) {
    ctx.beginPath();
    for (const e of items) {
      const r = e.hitBounds;
      ctx.rect(r.x, r.y, r.w, r.h);
    }
    ctx.fillStyle = style.nodeFill;
    ctx.fill();
    ctx.lineWidth = style.nodeLineWidth * unit;
    ctx.strokeStyle = style.nodeStroke;
    ctx.stroke();
  }
  // Selection and diagnostics stay visible at every level.
  for (const e of list) {
    const selected = state.isSelected(e.id);
    if (!selected && e.record.status === undefined) continue;
    const diagnostics = diagnosticsOf(e.record.status);
    if (!selected && diagnostics.length === 0) continue;
    setMatrix(ctx, compose(frame.worldToDevice, e.toWorld));
    const bounds = transformRect(e.toLocal, e.bodyBounds);
    if (selected) drawNodeSelection(ctx, bounds, frame.theme, unit);
    drawNodeBadges(ctx, bounds, diagnostics, frame.theme, unit);
  }
  ctx.restore();
}
