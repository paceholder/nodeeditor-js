/**
 * Scene layer painting (LAY-03, VIS-02, VIS-03, REN-01).
 *
 * Per frame: ask the geometry scene for items whose painted bounds meet the visible world
 * rectangle (already in paint order), then paint by z-layer in the configured order. Each
 * node gets one composed matrix (device . viewport . node) set once; connections and port
 * glyphs paint in world space. Painters come from the registries and can be swapped
 * independently of geometry.
 */
import {
  type ConnectionEntry,
  compose,
  type GeometryScene,
  type GraphReader,
  type NodeEntry,
  type SceneLayer,
  transformRect,
} from "../../../core/index.js";
import type { AssetService } from "../assets/asset-service.js";
import { type PaintFrame, setMatrix } from "../primitives/frame.js";
import type { PainterRegistries } from "../registries/painters.js";
import { resolveStyle } from "../theme/resolve-style.js";
import {
  diagnosticsOf,
  drawConnectionSelection,
  drawNodeBadges,
  drawNodeSelection,
} from "./decorations.js";
import { type DetailPolicy, detailPolicy } from "./level-of-detail.js";

/** View-local state the tools will own; this change only reads it. */
export interface ViewState {
  isSelected(id: string): boolean;
  isHovered(id: string): boolean;
}

export const EMPTY_VIEW_STATE: ViewState = {
  isSelected: () => false,
  isHovered: () => false,
};

export interface SceneLayerDeps {
  readonly reader: GraphReader;
  readonly scene: GeometryScene;
  readonly painters: PainterRegistries;
  /** Must match the `layerOrder` the scene was created with. */
  readonly zOrder: readonly SceneLayer[];
  readonly state: ViewState;
  readonly assets: AssetService;
}

export interface ScenePaintStats {
  readonly nodes: number;
  readonly connections: number;
}

export const DEFAULT_Z_ORDER: readonly SceneLayer[] = [
  "connection",
  "node",
  "port",
];

function paintConnections(
  ctx: CanvasRenderingContext2D,
  deps: SceneLayerDeps,
  frame: PaintFrame,
  list: readonly ConnectionEntry[],
  detail: DetailPolicy,
  unit: number,
): void {
  setMatrix(ctx, frame.worldToDevice);
  for (const e of list) {
    if (!e.path) continue;
    const selected = deps.state.isSelected(e.id);
    ctx.save();
    if (selected) drawConnectionSelection(ctx, e.path, frame.theme, unit);
    deps.painters.connections.get(e.record.kind).paint(ctx, {
      connection: e.record,
      path: e.path,
      style: resolveStyle(frame.theme, { type: e.record.kind, id: e.id }),
      detail,
      unit,
      selected,
    });
    ctx.restore();
  }
}

function paintNodes(
  ctx: CanvasRenderingContext2D,
  deps: SceneLayerDeps,
  frame: PaintFrame,
  list: readonly NodeEntry[],
  detail: DetailPolicy,
  unit: number,
): void {
  // Node space has unit scale, so device pixels per local unit is zoom * dpr.
  const assets = deps.assets.drawer(ctx, frame.viewport.zoom * frame.dpr);
  for (const e of list) {
    const bounds = transformRect(e.toLocal, e.bodyBounds);
    const diagnostics = diagnosticsOf(e.record.status);
    const selected = deps.state.isSelected(e.id);
    ctx.save();
    setMatrix(ctx, compose(frame.worldToDevice, e.toWorld));
    deps.painters.nodes.get(e.record.type).paint(ctx, {
      node: e.record,
      bounds,
      style: resolveStyle(frame.theme, { type: e.record.type, id: e.id }),
      detail,
      unit,
      assets,
      state: { selected, hovered: deps.state.isHovered(e.id), diagnostics },
    });
    // Always drawn, whatever the painter or detail level did (LAY-04).
    if (selected) drawNodeSelection(ctx, bounds, frame.theme, unit);
    drawNodeBadges(ctx, bounds, diagnostics, frame.theme, unit);
    ctx.restore();
  }
}

function paintPorts(
  ctx: CanvasRenderingContext2D,
  deps: SceneLayerDeps,
  frame: PaintFrame,
  list: readonly NodeEntry[],
  detail: DetailPolicy,
  unit: number,
): void {
  setMatrix(ctx, frame.worldToDevice);
  for (const e of list) {
    const ports = deps.reader.portsOf(e.id);
    for (const anchor of e.anchors) {
      const port = ports.find((p) => p.id === anchor.portId);
      if (!port) continue;
      ctx.save();
      deps.painters.portGlyphs.get(port.typeKey).paint(ctx, {
        port,
        position: anchor.position,
        normal: anchor.normal,
        style: resolveStyle(frame.theme, { type: port.typeKey, id: port.id }),
        detail,
        unit,
      });
      ctx.restore();
    }
  }
}

export function paintScene(
  ctx: CanvasRenderingContext2D,
  deps: SceneLayerDeps,
  frame: PaintFrame,
): ScenePaintStats {
  const nodes: NodeEntry[] = [];
  const connections: ConnectionEntry[] = [];
  for (const item of deps.scene.queryRect(frame.visibleWorld, "painted")) {
    if (item.kind === "node") {
      const e = deps.scene.node(item.id);
      if (e) nodes.push(e);
    } else {
      const e = deps.scene.connection(item.id);
      if (e) connections.push(e);
    }
  }
  const detail = detailPolicy(frame.viewport.zoom, frame.theme);
  const unit = frame.theme.screenSpaceLines ? 1 / frame.viewport.zoom : 1;
  for (const layer of deps.zOrder) {
    switch (layer) {
      case "connection":
        paintConnections(ctx, deps, frame, connections, detail, unit);
        break;
      case "node":
        paintNodes(ctx, deps, frame, nodes, detail, unit);
        break;
      case "port":
        paintPorts(ctx, deps, frame, nodes, detail, unit);
        break;
    }
  }
  return { nodes: nodes.length, connections: connections.length };
}
