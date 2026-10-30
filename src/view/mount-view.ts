/**
 * `mountView`: the only place the view touches the browser.
 *
 * Creates the layer stack, tracks container metrics, owns the frame scheduler, binds the
 * model (own geometry scene, committed changes mark layers dirty), and returns a handle
 * whose `dispose()` releases every observer, listener, frame request, subscription,
 * bitmap and DOM node.
 */
import { createGeometryRegistry, DEFAULT_VIEWPORT } from "../core/index.js";
import { createOverlayHost } from "./interact/overlay/overlay-host.js";
import { createPresence } from "./interact/overlay/presence.js";
import { createSelectionModel } from "./interact/selection/selection-model.js";
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
import { portsVisible } from "./render/paint/level-of-detail.js";
import {
  createHiddenIds,
  createPreviewHost,
} from "./render/paint/previews/preview-host.js";
import {
  DEFAULT_Z_ORDER,
  EMPTY_VIEW_STATE,
  type ViewState,
} from "./render/paint/scene-layer.js";
import { createPainterRegistries } from "./render/registries/painters.js";
import { DEFAULT_THEME, mergeTheme } from "./render/theme/tokens.js";
import { attachEditing, type Editing } from "./view-editing.js";
import type { ViewHandle, ViewOptions } from "./view-types.js";

export type { InputOptions, ViewHandle, ViewOptions } from "./view-types.js";

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

  // Entities a drag preview draws itself are hidden from the scene layer (D6).
  const hidden = createHiddenIds();
  const baseState = options.viewState ?? EMPTY_VIEW_STATE;
  // The view's own selection and hover feed the painters next to any host-supplied state.
  const selection = createSelectionModel();
  const offSelection = [
    ...(options.model ? [selection.bindToModel(options.model)] : []),
    selection.on(() => scheduler.markDirty("scene")),
  ];
  let hovered: string | undefined;
  const viewState: ViewState = {
    isSelected: (id) => selection.isSelected(id) || baseState.isSelected(id),
    isHovered: (id) => id === hovered || baseState.isHovered(id),
    isHidden: (id) => hidden.isHidden(id) || baseState.isHidden?.(id) === true,
  };

  const paintLayer = createLayerPainter({
    canvases: stack.canvases,
    backing: () => backing,
    viewport: () => viewport.get(),
    theme: () => theme,
    painters,
    interaction,
    assets,
    zOrder: options.zOrder ?? DEFAULT_Z_ORDER,
    viewState,
    bound: () => (reader && scene ? { reader, scene } : undefined),
  });

  const scheduler = createFrameScheduler(
    clock,
    (layer) => {
      // Zero-size containers wait for measurable bounds.
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
  const previews = createPreviewHost({
    interaction,
    hidden,
    invalidateScene: () => scheduler.markDirty("scene"),
    bound: () =>
      reader && scene
        ? {
            reader,
            scene,
            painters,
            zOrder: options.zOrder ?? DEFAULT_Z_ORDER,
            state: viewState,
            assets,
          }
        : undefined,
  });
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
      // Presence is positioned in world space, so it follows the viewport.
      if (presence.active) scheduler.markDirty("interaction");
    },
    options.initialViewport ?? DEFAULT_VIEWPORT,
  );

  const editing: Editing = attachEditing({
    root: stack.root,
    overlay: stack.overlay,
    model: options.model,
    scene,
    selection,
    viewport,
    size: () => metrics.size(),
    setPreview: previews.set,
    setHovered(id) {
      if (id === hovered) return;
      hovered = id;
      scheduler.markDirty("scene");
    },
    input: options.input ?? {},
    hidePortsBelow: () => theme.lodHidePortsBelow,
  });

  const offPainters = [
    painters.nodes.onChange(() => scheduler.markDirty("scene")),
    painters.portGlyphs.onChange(() => scheduler.markDirty("scene")),
    painters.connections.onChange(() => scheduler.markDirty("scene")),
    painters.background.onChange(() => scheduler.markDirty("background")),
    // A ready or failed asset repaints the scene.
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
    setToolPreview: previews.set,
    selection: {
      keys: selection.keys,
      has: selection.has,
      get size() {
        return selection.size;
      },
      primary: selection.primary,
      nodeIds: selection.nodeIds,
      connectionIds: selection.connectionIds,
      isSelected: selection.isSelected,
      apply: selection.apply,
      replace: selection.replace,
      add: selection.add,
      toggle: selection.toggle,
      clear: selection.clear,
      on: selection.on,
    },
    commands: {
      run: editing.commands.run,
      availability: editing.commands.availability,
      list: editing.commands.list,
      register: editing.commands.register,
    },
    toolOptions: editing.toolOptions,
    setToolOptions: editing.setToolOptions,
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
      const zoom = viewport.get().zoom;
      // Hidden ports are not pickable unless the caller asks.
      const ports = portsVisible(zoom, theme);
      return scene.pick(at.value, { ports, ...opts, zoom });
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
      // First: a gesture in flight is cancelled while everything it touches still exists.
      editing.dispose();
      for (const off of offSelection) off();
      selection.dispose();
      previews.dispose();
      binding?.dispose();
      scheduler.dispose();
      overlay.dispose();
      assets.dispose();
      metrics.dispose();
      stack.destroy();
    },
  };
}
