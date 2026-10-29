/**
 * Paints one named layer onto its canvas: clear at backing size, build the frame, then
 * dispatch to the background painter, the scene layer, or the interaction painters.
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
  /** Present when the view is bound to a model. */
  readonly bound: () =>
    | { reader: GraphReader; scene: GeometryScene }
    | undefined;
}

/** Returns the scene paint counts when the scene layer was painted. */
export function createLayerPainter(
  env: LayerPainterEnv,
): (layer: LayerName) => ScenePaintStats | undefined {
  return (layer) => {
    const canvas = env.canvases[layer];
    const ctx = canvas.getContext("2d");
    if (!ctx) return undefined;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
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
          },
          frame,
        );
      }
      case "interaction":
        env.interaction.paint(ctx, frame);
        return undefined;
    }
  };
}
