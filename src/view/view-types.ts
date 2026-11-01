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
import type { ConnectionChooser } from "./interact/choice/choice-types.js";
import type { ClipboardOptions } from "./interact/clipboard/clipboard-types.js";
import type { ViewClipboard } from "./interact/clipboard/view-clipboard.js";
import type { CommandRegistry } from "./interact/commands/command-registry.js";
import type { KeyBinding, Platform } from "./interact/commands/keymap.js";
import type { ViewEventMap } from "./interact/context-menu/context-menu-types.js";
import type {
  OverlayAnchor,
  OverlayHandle,
} from "./interact/overlay/overlay-host.js";
import type { PresenceEntry } from "./interact/overlay/presence.js";
import type { SelectionModel } from "./interact/selection/selection-model.js";
import type { ToolOptions } from "./interact/tools/thresholds.js";
import type { ToolSlot } from "./interact/tools/tool-router.js";
import type { ToolPreview } from "./interact/tools/tool-types.js";
import type { FrameClock, LayerName } from "./platform/frame-scheduler.js";
import type { ViewModel } from "./platform/model-binding.js";
import type { RenderStats } from "./platform/render-stats.js";
import type { ViewportState } from "./platform/viewport-state.js";
import type { AssetService } from "./render/assets/asset-service.js";
import type { AssetOptions } from "./render/assets/asset-types.js";
import type { GestureBitmapOptions } from "./render/paint/gesture-bitmap.js";
import type { InteractionLayer } from "./render/paint/interaction-layer.js";
import type { ViewState } from "./render/paint/scene-layer.js";
import type { PainterRegistries } from "./render/registries/painters.js";
import type { ThemeInput, ThemeTokens } from "./render/theme/tokens.js";

/** Pointer, wheel and keyboard input of a mounted view (INT-05, INT-06). */
export interface InputOptions {
  /** Tools in router precedence order; the built-in tools when omitted. */
  readonly tools?: readonly ToolSlot[];
  readonly toolOptions?: Partial<ToolOptions>;
  /** Replaces the default keymap. */
  readonly keymap?: readonly KeyBinding[];
  /** `Mod` is Cmd on macOS and Ctrl elsewhere; detected from `navigator` when omitted. */
  readonly platform?: Platform;
  /**
   * Copy, cut, paste and duplicate (EDT-03): the placement step, external-connection
   * handling, and `system: false` to keep the clipboard in-app only.
   */
  readonly clipboard?: ClipboardOptions;
  /**
   * Picks among a policy's alternatives when a connection is released on a target that
   * needs a choice (INT-12). Without one such a release commits nothing.
   */
  readonly chooseConnection?: ConnectionChooser;
}

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
  /** Selection/hover/hidden state; the selection model is the intended source. */
  readonly viewState?: ViewState;
  readonly initialViewport?: Viewport;
  /**
   * Input handling: default tools and keymap when omitted, none with `false`. Editing
   * needs a model with the command API (a `GraphModel` fits); a read-only model still
   * allows selection, pan and zoom.
   */
  readonly input?: false | InputOptions;
  /**
   * Opt-in gesture bitmap reuse (LAY-05, off when absent): while only the viewport
   * changes and at least `minVisible` entities were visible, the scene layer redraws its
   * last exact frame transformed instead of repainting, and repaints exactly once the
   * viewport has rested for `settleMs`. Uncovered areas show the background until then.
   * Reuse stops (the frame is exact) once the zoom ratio to the stored frame exceeds
   * `maxZoomRatio` either way or more than `maxUncovered` of the view is uncovered.
   */
  readonly gestureBitmap?: GestureBitmapOptions;
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
   * measurable or no model is bound. Tolerances are CSS pixels (GEO-05). Below the
   * theme's `lodHidePortsBelow` ports are left out unless `opts.ports` says otherwise.
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
  /**
   * Show or clear a tool gesture preview (marquee, move ghosts). Repaints the interaction
   * layer only; the scene layer repaints when a move preview starts or ends. Previews are
   * never serialized and never reach the model.
   */
  setToolPreview(preview: ToolPreview | null): void;
  /**
   * This view's selection (MOD-10). Entities that leave the model drop out of it, and
   * changes repaint the scene layer.
   */
  readonly selection: Omit<SelectionModel, "dispose" | "bindToModel">;
  /** Editor commands under stable IDs: the API, shortcuts and menus share them (INT-07). */
  readonly commands: Pick<
    CommandRegistry,
    "run" | "availability" | "list" | "register"
  >;
  /**
   * Clipboard text for host export/import dialogs and a toolbar Paste button (EDT-05).
   * `on("paste")` reports every paste and duplicate, with the excluded external
   * connections; `on("clipboard-error")` reports a refused system clipboard.
   */
  readonly clipboard: ViewClipboard;
  /**
   * Subscribe to view events; returns the unsubscribe function. `"context-menu"` fires on
   * a right-click, a touch long-press, or the menu key / Shift+F10 (INT-11). While any
   * listener is registered the browser's own context menu is suppressed.
   */
  on<K extends keyof ViewEventMap>(
    type: K,
    handler: (event: ViewEventMap[K]) => void,
  ): () => void;
  /** Install, replace or remove (`undefined`) the connection chooser; cancels a pending choice. */
  setConnectionChooser(chooser: ConnectionChooser | undefined): void;
  /** The tool options in effect (defaults merged with the mount and runtime overrides). */
  toolOptions(): ToolOptions;
  /**
   * Change tool options from the next input event on, for example `{ gridStep: undefined }`
   * to turn snapping off or `{ emptyDrag: "marquee" }`. Keys merge with earlier patches.
   */
  setToolOptions(patch: Partial<ToolOptions>): void;
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
