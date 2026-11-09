/**
 * Scene layer painting.
 *
 * Per frame: ask the geometry scene for items whose painted bounds meet the visible world
 * rectangle (already in paint order), then paint by z-layer in the configured order. Each
 * node gets one composed matrix (device . viewport . node) set once; connections and port
 * glyphs paint in world space. Painters come from the registries and can be swapped
 * independently of geometry. At the `overview` detail level nodes and connections are
 * drawn in style batches by `overview-painter.ts` instead (D3).
 *
 * Painters are host code and may throw. Every painter call is isolated: the saved state
 * is always restored, the error goes to `fault`, and the rest of the layer still paints.
 */

import {
  type ConnectionEntry,
  compose,
  type GeometryScene,
  type GraphReader,
  type NodeEntry,
  type Rect,
  type SceneLayer,
  transformRect,
} from "../../../core/index.js";
import { deepFreeze } from "../../platform/deep-freeze.js";
import { rethrowLater } from "../../platform/rethrow-later.js";
import type { AssetService } from "../assets/asset-service.js";
import { type PaintFrame, setMatrix } from "../primitives/frame.js";
import type { PainterRegistries } from "../registries/painters.js";
import type { RouteEditorRegistry } from "../registries/route-editor-registry.js";
import { createStyleLookup } from "../theme/resolve-style.js";
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
import { drawRouteGrips } from "./route-grips.js";

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

export const EMPTY_VIEW_STATE: ViewState = deepFreeze({
  isSelected: () => false,
  isHovered: () => false,
});

export interface SceneLayerDeps {
  readonly reader: GraphReader;
  readonly scene: GeometryScene;
  readonly painters: PainterRegistries;
  /** Must match the `layerOrder` the scene was created with. */
  readonly zOrder: readonly SceneLayer[];
  readonly state: ViewState;
  readonly assets: AssetService;
  /** Selected connections of a kind with an editor get grips; omitted: none. */
  readonly routeEditors?: Pick<RouteEditorRegistry, "get">;
  /** A painter threw; omitted: the error is rethrown outside the frame. */
  readonly fault?: (error: unknown) => void;
  /**
   * Node body bounds in local space per scene entry (entries are replaced when a node
   * changes), so an unchanged node costs no rectangle per frame. Omitted: computed.
   */
  readonly localBounds?: WeakMap<NodeEntry, Rect<"local">>;
}

function boundsOf(deps: SceneLayerDeps, e: NodeEntry): Rect<"local"> {
  const cached = deps.localBounds?.get(e);
  if (cached) return cached;
  const bounds = transformRect(e.toLocal, e.bodyBounds);
  deps.localBounds?.set(e, bounds);
  return bounds;
}

export interface ScenePaintStats {
  readonly nodes: number;
  readonly connections: number;
}

export const DEFAULT_Z_ORDER: readonly SceneLayer[] = deepFreeze([
  "connection",
  "node",
  "port",
]);

function paintConnections(
  ctx: CanvasRenderingContext2D,
  deps: SceneLayerDeps,
  frame: PaintFrame,
  list: readonly ConnectionEntry[],
  detail: DetailPolicy,
  unit: number,
): void {
  const fault = deps.fault ?? rethrowLater;
  const style = createStyleLookup(frame.theme);
  setMatrix(ctx, frame.worldToDevice);
  for (const e of list) {
    if (!e.path) continue;
    const selected = deps.state.isSelected(e.id);
    ctx.save();
    try {
      if (selected) drawConnectionSelection(ctx, e.path, frame.theme, unit);
      deps.painters.connections.get(e.record.kind).paint(ctx, {
        connection: e.record,
        path: e.path,
        route: e.route ?? UNCHECKED_ROUTE,
        style: style(e.record.kind, e.id),
        detail,
        unit,
        selected,
      });
    } catch (error) {
      fault(error);
    } finally {
      ctx.restore();
    }
    if (selected) {
      const editor = deps.routeEditors?.get(e.record.kind);
      if (editor)
        drawRouteGrips(ctx, e, editor, frame.theme, unit, frame.viewport.zoom);
    }
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
  const fault = deps.fault ?? rethrowLater;
  const style = createStyleLookup(frame.theme);
  for (const e of list) {
    const bounds = boundsOf(deps, e);
    const diagnostics = diagnosticsOf(e.record.status);
    const selected = deps.state.isSelected(e.id);
    const matrix = compose(frame.worldToDevice, e.toWorld);
    ctx.save();
    try {
      setMatrix(ctx, matrix);
      deps.painters.nodes.get(e.record.type).paint(ctx, {
        node: e.record,
        bounds,
        style: style(e.record.type, e.id),
        detail,
        unit,
        assets,
        state: { selected, hovered: deps.state.isHovered(e.id), diagnostics },
      });
    } catch (error) {
      fault(error);
    } finally {
      ctx.restore();
    }
    // Always drawn, whatever the painter or detail level did.
    ctx.save();
    setMatrix(ctx, matrix);
    if (selected) drawNodeSelection(ctx, bounds, frame.theme, unit);
    drawNodeBadges(ctx, bounds, diagnostics, frame.theme, unit);
    ctx.restore();
  }
}

/**
 * Port glyphs run without a `save`/`restore` each (D4): the layer sets the state the
 * built-in glyphs use before every call and restores once at the end, so nothing leaks
 * into later layers. After a glyph throws, the layer's saved state is restored and saved
 * again, so whatever that glyph set (a clip) does not reach the next one.
 */
function paintPorts(
  ctx: CanvasRenderingContext2D,
  deps: SceneLayerDeps,
  frame: PaintFrame,
  list: readonly NodeEntry[],
  detail: DetailPolicy,
  unit: number,
): void {
  const fault = deps.fault ?? rethrowLater;
  const styleOf = createStyleLookup(frame.theme);
  ctx.save();
  setMatrix(ctx, frame.worldToDevice);
  for (const e of list) {
    for (const anchor of e.anchors) {
      // Direct lookup: no port list per node and no search per anchor.
      const port = deps.reader.getPort(anchor.portId);
      if (!port || port.node !== e.id) continue;
      const style = styleOf(port.typeKey, port.id);
      ctx.fillStyle = style.portFill;
      ctx.strokeStyle = style.portStroke;
      ctx.lineWidth = unit;
      try {
        deps.painters.portGlyphs.get(port.typeKey).paint(ctx, {
          port,
          position: anchor.position,
          normal: anchor.normal,
          style,
          detail,
          unit,
        });
      } catch (error) {
        fault(error);
        ctx.restore();
        ctx.save();
        setMatrix(ctx, frame.worldToDevice);
      }
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
        // Hidden when zoomed out; picking skips them below the same zoom.
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
