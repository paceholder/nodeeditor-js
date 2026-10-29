/**
 * `mountView`: the only place the view touches the browser (REA-06, LIFE-01).
 *
 * Creates the layer stack, tracks container metrics, owns the frame scheduler, binds the
 * model (own geometry scene, committed changes mark layers dirty), and returns a handle
 * whose `dispose()` releases every observer, listener, frame request, subscription,
 * bitmap and DOM node.
 */
import { createGeometryRegistry, DEFAULT_VIEWPORT } from "../core/index.js";
import { createOverlayHost } from "./interact/overlay/overlay-host.js";
import { createPresence } from "./interact/overlay/presence.js";
import {
  type ContainerMetrics,
  observeContainer,
} from "./platform/dom/container-metrics.js";
import { createLayerStack } from "./platform/dom/layer-stack.js";
import {
  createFrameScheduler,
  type FrameClock,
} from "./platform/frame-scheduler.js";
import { bindModel, type ModelBinding } from "./platform/model-binding.js";
import { createStatsRecorder } from "./platform/render-stats.js";
import { createViewportState } from "./platform/viewport-state.js";
import { createAssetService } from "./render/assets/asset-service.js";
import { createInteractionLayer } from "./render/paint/interaction-layer.js";
import { createLayerPainter } from "./render/paint/layer-painter.js";
import {
  DEFAULT_Z_ORDER,
  EMPTY_VIEW_STATE,
} from "./render/paint/scene-layer.js";
import { createPainterRegistries } from "./render/registries/painters.js";
import { DEFAULT_THEME, mergeTheme } from "./render/theme/tokens.js";
import type { ViewHandle, ViewOptions } from "./view-types.js";

export type { ViewHandle, ViewOptions } from "./view-types.js";

export function mountView(
  container: HTMLElement,
  options: ViewOptions = {},
): ViewHandle {
  const win = container.ownerDocument.defaultView;
  if (!win) throw new Error("mountView needs an attached document");
  const stack = createLayerStack(container);
  let disposed = false;
  let backing = { width: 0, height: 0, dpr: 0 };

  const clock: FrameClock = options.frameClock ?? {
    request: (cb) => win.requestAnimationFrame(cb),
    cancel: (h) => win.cancelAnimationFrame(h),
  };

  const painters = options.painters ?? createPainterRegistries();
  const geometry = options.geometry ?? createGeometryRegistry();
  const assets = createAssetService(options.assets);
  const stats = createStatsRecorder();
  let theme = mergeTheme(DEFAULT_THEME, options.theme ?? {});
  const interaction = createInteractionLayer(() =>
    scheduler.markDirty("interaction"),
  );

  const binding: ModelBinding | undefined = options.model
    ? bindModel(options.model, {
        geometry,
        zOrder: options.zOrder ?? DEFAULT_Z_ORDER,
        markDirty: (...layers) => scheduler.markDirty(...layers),
      })
    : undefined;
  const reader = options.model?.reader;
  const scene = binding?.scene;

  const presence = createPresence(() => scene);
  const overlay = createOverlayHost({
    layer: stack.overlay,
    viewport: () => viewport.get(),
    scene: () => scene,
  });

  const paintLayer = createLayerPainter({
    canvases: stack.canvases,
    backing: () => backing,
    viewport: () => viewport.get(),
    theme: () => theme,
    painters,
    interaction,
    assets,
    zOrder: options.zOrder ?? DEFAULT_Z_ORDER,
    viewState: options.viewState ?? EMPTY_VIEW_STATE,
    bound: () => (reader && scene ? { reader, scene } : undefined),
  });

  const scheduler = createFrameScheduler(
    clock,
    (layer) => {
      // Zero-size containers wait for measurable bounds (GEO-06).
      if (!metrics.isMeasurable()) return;
      const t0 = win.performance.now();
      const painted = paintLayer(layer);
      stats.layerPainted(layer, win.performance.now() - t0);
      if (painted && reader) {
        stats.scenePainted(painted, {
          nodes: reader.nodes().length,
          connections: reader.connections().length,
        });
      }
    },
    () => {
      stats.frameEnd();
      if (overlay.count > 0) overlay.layout();
    },
  );
  interaction.add(presence.painter);
  const dirtyAll = (): void =>
    scheduler.markDirty("background", "scene", "interaction");

  const metrics: ContainerMetrics = observeContainer(stack.root, () => {
    if (!metrics.isMeasurable()) return;
    const { width, height } = metrics.size();
    const dpr = metrics.dpr();
    if (
      backing.width !== width ||
      backing.height !== height ||
      backing.dpr !== dpr
    ) {
      backing = { width, height, dpr };
      stack.resize(width, height, dpr);
    }
    dirtyAll();
  });
  const viewport = createViewportState(
    metrics,
    () => {
      scheduler.markDirty("background", "scene");
      // Presence is positioned in world space, so it follows the viewport (OVL-02).
      if (presence.active) scheduler.markDirty("interaction");
    },
    options.initialViewport ?? DEFAULT_VIEWPORT,
  );

  const offPainters = [
    painters.nodes.onChange(() => scheduler.markDirty("scene")),
    painters.portGlyphs.onChange(() => scheduler.markDirty("scene")),
    painters.connections.onChange(() => scheduler.markDirty("scene")),
    painters.background.onChange(() => scheduler.markDirty("background")),
    // A ready or failed asset repaints the scene (AST-02).
    assets.onChange(() => scheduler.markDirty("scene")),
  ];

  return {
    painters,
    geometry,
    assets: {
      status: assets.status,
      diagnostics: assets.diagnostics,
      retry: assets.retry,
      setResolver: assets.setResolver,
      stats: assets.stats,
    },
    interaction: { add: interaction.add, invalidate: interaction.invalidate },
    overlay: { attach: overlay.attach },
    setPresence(entries) {
      presence.set(entries);
      interaction.invalidate();
    },
    theme: () => theme,
    setTheme(patch) {
      theme = mergeTheme(theme, patch);
      scheduler.markDirty("background", "scene");
    },
    viewport: {
      get: viewport.get,
      set: viewport.set,
      zoomAt: viewport.zoomAt,
      panBy: viewport.panBy,
    },
    clientToWorld: viewport.clientToWorld,
    pick(clientX, clientY, opts) {
      const at = viewport.clientToWorld(clientX, clientY);
      if (!at.ok || !scene) return [];
      return scene.pick(at.value, { ...opts, zoom: viewport.get().zoom });
    },
    invalidate: (...layers) => scheduler.markDirty(...layers),
    renderStats: stats.snapshot,
    noteInput: stats.noteInput,
    geometryStats: () => scene?.stats(),
    metrics: () => ({ ...backing }),
    element: stack.root,
    overlayElement: stack.overlay,
    canvases: stack.canvases,
    get disposed() {
      return disposed;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const off of offPainters) off();
      binding?.dispose();
      scheduler.dispose();
      overlay.dispose();
      assets.dispose();
      metrics.dispose();
      stack.destroy();
    },
  };
}
