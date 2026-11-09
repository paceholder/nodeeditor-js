/**
 * Paints one named layer onto its canvas: reset and clear at backing size, build the
 * frame, then dispatch to the background painter, the scene layer, or the interaction
 * painters. A painter that throws is reported once per layer paint (`onError`); the
 * layer itself goes on painting, and the next paint starts from a reset context.
 */
import type {
  GeometryScene,
  GraphReader,
  SceneLayer,
  Viewport,
} from "../../../core/index.js";
import type { LayerName } from "../../platform/frame-scheduler.js";
import type { AssetService } from "../assets/asset-service.js";
import { createPaintFrame } from "../primitives/frame.js";
import type { PainterRegistries } from "../registries/painters.js";
import type { RouteEditorRegistry } from "../registries/route-editor-registry.js";
import type { ThemeTokens } from "../theme/tokens.js";
import type { InteractionLayer } from "./interaction-layer.js";
import {
  paintScene,
  type ScenePaintStats,
  type ViewState,
} from "./scene-layer.js";

export interface LayerPainterEnv {
  readonly canvases: Readonly<Record<LayerName, HTMLCanvasElement>>;
  readonly backing: () => { width: number; height: number; dpr: number };
  readonly viewport: () => Viewport;
  readonly theme: () => ThemeTokens;
  readonly painters: PainterRegistries;
  readonly interaction: InteractionLayer;
  readonly assets: AssetService;
  readonly zOrder: readonly SceneLayer[];
  readonly viewState: ViewState;
  readonly routeEditors?: Pick<RouteEditorRegistry, "get">;
  /** Present when the view is bound to a model. */
  readonly bound: () =>
    | { reader: GraphReader; scene: GeometryScene }
    | undefined;
  /** The first painter error of one layer paint. */
  readonly onError: (layer: LayerName, error: unknown) => void;
}

/**
 * Reset the context state (transform, clip, save stack, styles): a painter that set a clip
 * or left a `save` unbalanced cannot reach the next paint. Without `ctx.reset()` the
 * backing store is reassigned instead, which also resets, but only after a fault, since it
 * reallocates the store.
 */
function resetContext(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  faulted: boolean,
): void {
  if (typeof ctx.reset === "function") ctx.reset();
  else if (faulted) {
    const width = canvas.width;
    canvas.width = width;
  }
}

/** Returns the scene paint counts when the scene layer was painted. */
export function createLayerPainter(
  env: LayerPainterEnv,
): (layer: LayerName) => ScenePaintStats | undefined {
  const faulted = new Set<LayerName>();
  return (layer) => {
    const canvas = env.canvases[layer];
    const ctx = canvas.getContext("2d");
    if (!ctx) return undefined;
    resetContext(ctx, canvas, faulted.delete(layer));
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    let first: { error: unknown } | undefined;
    const fault = (error: unknown): void => {
      faulted.add(layer);
      first ??= { error };
    };
    try {
      return paintLayer(env, layer, ctx, fault);
    } catch (error) {
      fault(error);
      return undefined;
    } finally {
      if (first) env.onError(layer, first.error);
    }
  };
}

function paintLayer(
  env: LayerPainterEnv,
  layer: LayerName,
  ctx: CanvasRenderingContext2D,
  fault: (error: unknown) => void,
): ScenePaintStats | undefined {
  const frame = createPaintFrame(env.backing(), env.viewport(), env.theme());
  switch (layer) {
    case "background":
      env.painters.background.get()(ctx, frame);
      return undefined;
    case "scene": {
      const bound = env.bound();
      if (!bound) return undefined;
      return paintScene(
        ctx,
        {
          reader: bound.reader,
          scene: bound.scene,
          painters: env.painters,
          zOrder: env.zOrder,
          state: env.viewState,
          assets: env.assets,
          fault,
          ...(env.routeEditors ? { routeEditors: env.routeEditors } : {}),
        },
        frame,
      );
    }
    case "interaction":
      env.interaction.paint(ctx, frame, fault);
      return undefined;
  }
}
