/** Public option and handle types of `mountView`. */
import type {
  GeometryRegistry,
  HitCandidate,
  PickOptions,
  Point,
  Rejection,
  Result,
  SceneLayer,
  SceneStats,
  Viewport,
} from "../core/index.js";
import type {
  OverlayAnchor,
  OverlayHandle,
} from "./interact/overlay/overlay-host.js";
import type { PresenceEntry } from "./interact/overlay/presence.js";
import type { FrameClock, LayerName } from "./platform/frame-scheduler.js";
import type { ViewModel } from "./platform/model-binding.js";
import type { RenderStats } from "./platform/render-stats.js";
import type { ViewportState } from "./platform/viewport-state.js";
import type { AssetService } from "./render/assets/asset-service.js";
import type { AssetOptions } from "./render/assets/asset-types.js";
import type { InteractionLayer } from "./render/paint/interaction-layer.js";
import type { ViewState } from "./render/paint/scene-layer.js";
import type { PainterRegistries } from "./render/registries/painters.js";
import type { ThemeInput, ThemeTokens } from "./render/theme/tokens.js";

export interface ViewOptions {
  /**
   * The model to show: reads plus committed-change events (a `GraphModel` fits). The view
   * builds and owns a geometry scene over it and repaints when edits commit. Without a
   * model the scene layer stays empty.
   */
  readonly model?: ViewModel;
  /** Node geometry registrations; a fresh registry is created when omitted. */
  readonly geometry?: GeometryRegistry;
  /** Paint layers bottom to top (also the scene's order). Default connections, nodes, ports. */
  readonly zOrder?: readonly SceneLayer[];
  /** Painter registries; a fresh set with fallbacks is created when omitted. */
  readonly painters?: PainterRegistries;
  readonly theme?: ThemeInput;
  /** Host asset resolver and cache budget; without a resolver nothing is fetched (AST-01). */
  readonly assets?: AssetOptions;
  /** Selection/hover state; the tools change supplies the real one. */
  readonly viewState?: ViewState;
  readonly initialViewport?: Viewport;
  /** Test seam: replaces `requestAnimationFrame`. */
  readonly frameClock?: FrameClock;
}

export interface ViewHandle {
  readonly viewport: Pick<ViewportState, "get" | "set" | "zoomAt" | "panBy">;
  clientToWorld(
    clientX: number,
    clientY: number,
  ): Result<Point<"world">, Rejection>;
  /**
   * Hit candidates under a client position, best first; empty when the position is not
   * measurable or no model is bound. Tolerances are CSS pixels (GEO-05).
   */
  pick(
    clientX: number,
    clientY: number,
    opts?: Omit<PickOptions, "zoom">,
  ): HitCandidate[];
  /** Painter registries, shared with the options when given. Changes repaint. */
  readonly painters: PainterRegistries;
  /** Geometry registrations, shared with the options when given. Changes repaint. */
  readonly geometry: GeometryRegistry;
  /** Ordered painters for previews and tool drawing, with explicit invalidation. */
  readonly interaction: Pick<InteractionLayer, "add" | "invalidate">;
  /** Host DOM aligned to the viewport (OVL-01, REN-03). */
  readonly overlay: {
    attach(element: HTMLElement, anchor: OverlayAnchor): OverlayHandle;
  };
  /** Replace remote cursors/selections; repaints the interaction layer only (OVL-02). */
  setPresence(entries: readonly PresenceEntry[]): void;
  /** The view's asset service: diagnostics, retry, resolver replacement (AST-04). */
  readonly assets: Pick<
    AssetService,
    "status" | "diagnostics" | "retry" | "setResolver" | "stats"
  >;
  theme(): ThemeTokens;
  /**
   * Patch the theme; repaints background and scene, never touches geometry. Override
   * tables merge per key, and a key set to `undefined` removes that override.
   */
  setTheme(theme: ThemeInput): void;
  /** Mark layers for repaint on the next frame. */
  invalidate(...layers: readonly LayerName[]): void;
  /** Cheap counters and timings for debugging and benchmarks (PERF-01). */
  renderStats(): RenderStats;
  /**
   * Tag the input being handled with a sequence number; `renderStats().lastPaintedInputSeq`
   * reports it once the next painted frame has drawn.
   */
  noteInput(seq: number): void;
  /** Geometry-scene work counters; undefined without a model (REN-04 checks). */
  geometryStats(): SceneStats | undefined;
  /** CSS size and pixel ratio the backing stores currently use. */
  metrics(): { width: number; height: number; dpr: number };
  readonly element: HTMLElement;
  readonly overlayElement: HTMLElement;
  readonly canvases: Readonly<Record<LayerName, HTMLCanvasElement>>;
  readonly disposed: boolean;
  dispose(): void;
}
