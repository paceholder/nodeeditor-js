/**
 * Scene layer painting (LAY-03, VIS-02, VIS-03, REN-01).
 *
 * Per frame: ask the geometry scene for items whose painted bounds meet the visible world
 * rectangle (already in paint order), then paint by z-layer in the configured order. Each
 * node gets one composed matrix (device . viewport . node) set once; connections and port
 * glyphs paint in world space. Painters come from the registries and can be swapped
 * independently of geometry. At the `overview` detail level nodes and connections are
 * drawn in style batches by `overview-painter.ts` instead (D3).
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
import {
  type DetailPolicy,
  detailPolicy,
  portsVisible,
} from "./level-of-detail.js";
import {
  paintOverviewConnections,
  paintOverviewNodes,
} from "./overview-painter.js";

/** Outcome reported for a path built before routes carried one. */
const UNCHECKED_ROUTE = { status: "complete", clearOf: "nothing" } as const;

/** View-local state the tools will own; this change only reads it. */
export interface ViewState {
  isSelected(id: string): boolean;
  isHovered(id: string): boolean;
  /**
   * Entities the scene layer skips (moved nodes while a drag preview draws them on the
   * interaction layer, D6). Omitted means nothing is hidden.
   */
  isHidden?(id: string): boolean;
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
      route: e.route ?? UNCHECKED_ROUTE,
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

/**
 * Port glyphs run without a `save`/`restore` each (D4): the layer sets the state the
 * built-in glyphs use before every call and restores once at the end, so nothing leaks
 * into later layers.
 */
function paintPorts(
  ctx: CanvasRenderingContext2D,
  deps: SceneLayerDeps,
  frame: PaintFrame,
  list: readonly NodeEntry[],
  detail: DetailPolicy,
  unit: number,
): void {
  ctx.save();
  setMatrix(ctx, frame.worldToDevice);
  for (const e of list) {
    const ports = deps.reader.portsOf(e.id);
    for (const anchor of e.anchors) {
      const port = ports.find((p) => p.id === anchor.portId);
      if (!port) continue;
      const style = resolveStyle(frame.theme, {
        type: port.typeKey,
        id: port.id,
      });
      ctx.fillStyle = style.portFill;
      ctx.strokeStyle = style.portStroke;
      ctx.lineWidth = unit;
      deps.painters.portGlyphs.get(port.typeKey).paint(ctx, {
        port,
        position: anchor.position,
        normal: anchor.normal,
        style,
        detail,
        unit,
      });
    }
  }
  ctx.restore();
}

/** Paint pre-resolved entries by z-layer. Shared by the scene and move previews. */
export function paintEntries(
  ctx: CanvasRenderingContext2D,
  deps: SceneLayerDeps,
  frame: PaintFrame,
  nodes: readonly NodeEntry[],
  connections: readonly ConnectionEntry[],
): void {
  const zoom = frame.viewport.zoom;
  const detail = detailPolicy(zoom, frame.theme);
  const unit = frame.theme.screenSpaceLines ? 1 / zoom : 1;
  // Overview draws nodes and connections in style batches, without painters (D3).
  const overview = detail.level === "overview";
  for (const layer of deps.zOrder) {
    switch (layer) {
      case "connection":
        if (overview)
          paintOverviewConnections(ctx, frame, connections, deps.state, unit);
        else paintConnections(ctx, deps, frame, connections, detail, unit);
        break;
      case "node":
        if (overview) paintOverviewNodes(ctx, frame, nodes, deps.state, unit);
        else paintNodes(ctx, deps, frame, nodes, detail, unit);
        break;
      case "port":
        // Hidden when zoomed out (LAY-04); picking skips them below the same zoom.
        // A threshold under the overview zoom (such as 0) keeps them at overview too.
        if (portsVisible(zoom, frame.theme))
          paintPorts(ctx, deps, frame, nodes, detail, unit);
        break;
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
  const hidden = deps.state.isHidden;
  for (const item of deps.scene.queryRect(frame.visibleWorld, "painted")) {
    if (hidden?.(item.id)) continue;
    if (item.kind === "node") {
      const e = deps.scene.node(item.id);
      if (e) nodes.push(e);
    } else {
      const e = deps.scene.connection(item.id);
      if (e) connections.push(e);
    }
  }
  paintEntries(ctx, deps, frame, nodes, connections);
  return { nodes: nodes.length, connections: connections.length };
}
