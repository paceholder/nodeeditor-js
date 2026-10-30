/**
 * Move preview painter (D6): ghosts of the moved nodes and their incident
 * connections at the drag offset, drawn on the interaction layer with the same painters
 * as the scene, plus a lock marker on selected nodes that stay in place. The scene layer
 * skips the moved entities while this preview is active, so a pointer move repaints this
 * layer only. Context starts in world space.
 */
import {
  affine,
  buildPath,
  type ConnectionEntry,
  compose,
  type GeometryScene,
  type GraphReader,
  type NodeEntry,
  type WorldAnchor,
} from "../../../../core/index.js";
import type { PaintFrame } from "../../primitives/frame.js";
import { paintEntries, type SceneLayerDeps } from "../scene-layer.js";
import type { ToolPreview } from "./preview-types.js";

type MovePreview = Extract<ToolPreview, { kind: "move" }>;

const GHOST_ALPHA = 0.75;
const LOCK_SIZE_PX = 12;

export interface MovePreviewDeps extends SceneLayerDeps {
  readonly reader: GraphReader;
  readonly scene: GeometryScene;
}

/** IDs the scene layer must skip while the preview runs: moved nodes and their paths. */
export function movedEntityIds(
  reader: GraphReader,
  preview: MovePreview,
): Set<string> {
  const ids = new Set<string>();
  for (const id of preview.moving) {
    ids.add(id);
    for (const c of reader.connectionsOfNode(id)) ids.add(c.id);
  }
  return ids;
}

function shiftNode(e: NodeEntry, dx: number, dy: number): NodeEntry {
  const move = affine<"world", "world">(1, 0, 0, 1, dx, dy);
  return {
    ...e,
    toWorld: compose(move, e.toWorld),
    anchors: e.anchors.map(
      (a): WorldAnchor => ({
        ...a,
        position: { x: a.position.x + dx, y: a.position.y + dy },
      }),
    ),
  };
}

function ghostConnection(
  e: ConnectionEntry,
  moved: ReadonlyMap<string, NodeEntry>,
  deps: MovePreviewDeps,
): ConnectionEntry | undefined {
  const end = (node: string, port: string) => {
    const entry = moved.get(node) ?? deps.scene.node(node as never);
    const a = entry?.anchors.find((x) => x.portId === port);
    return a ? { position: a.position, normal: a.normal } : undefined;
  };
  const from = end(e.record.from.node, e.record.from.port);
  const to = end(e.record.to.node, e.record.to.port);
  if (!from || !to) return undefined;
  return {
    ...e,
    path: buildPath("bezier", from, to),
    paintedBounds: undefined,
  };
}

function drawLock(
  ctx: CanvasRenderingContext2D,
  e: NodeEntry,
  frame: PaintFrame,
): void {
  const unit = 1 / frame.viewport.zoom;
  const s = LOCK_SIZE_PX * unit;
  const b = e.hitBounds;
  const x = b.x + b.w - s;
  const y = b.y - s * 0.4;
  ctx.lineWidth = 1.5 * unit;
  ctx.strokeStyle = frame.theme.warning;
  ctx.fillStyle = frame.theme.background;
  ctx.setLineDash([4 * unit, 3 * unit]);
  ctx.beginPath();
  ctx.rect(b.x, b.y, b.w, b.h);
  ctx.stroke();
  ctx.setLineDash([]);
  // Padlock: body and shackle.
  ctx.beginPath();
  ctx.rect(x, y + s * 0.45, s, s * 0.55);
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(x + s / 2, y + s * 0.45, s * 0.28, Math.PI, 0);
  ctx.stroke();
}

export function paintMovePreview(
  ctx: CanvasRenderingContext2D,
  deps: MovePreviewDeps,
  frame: PaintFrame,
  preview: MovePreview,
): void {
  const { x: dx, y: dy } = preview.offset;
  const moved = new Map<string, NodeEntry>();
  for (const id of preview.moving) {
    const e = deps.scene.node(id);
    if (e) moved.set(id, shiftNode(e, dx, dy));
  }
  const connections: ConnectionEntry[] = [];
  const seen = new Set<string>();
  for (const id of preview.moving) {
    for (const c of deps.reader.connectionsOfNode(id)) {
      if (seen.has(c.id)) continue;
      seen.add(c.id);
      const entry = deps.scene.connection(c.id);
      const ghost = entry && ghostConnection(entry, moved, deps);
      if (ghost) connections.push(ghost);
    }
  }
  ctx.save();
  ctx.globalAlpha = GHOST_ALPHA;
  paintEntries(ctx, deps, frame, [...moved.values()], connections);
  ctx.restore();
  for (const id of preview.locked) {
    const e = deps.scene.node(id);
    if (e) {
      ctx.save();
      drawLock(ctx, e, frame);
      ctx.restore();
    }
  }
}
