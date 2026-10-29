// Building blocks of the browser view: frame scheduling, DOM input, tool
// routing, layer painters and fallbacks, for hosts that assemble a view from parts.
// Mounting and customizing an editor needs only `nodeeditor-js/view`.
// Importing this module has no side effects.

export type { ContainerMetrics } from "./platform/dom/container-metrics.js";
export type { LayerStack } from "./platform/dom/layer-stack.js";
export type { FrameScheduler } from "./platform/frame-scheduler.js";
export { createFrameScheduler } from "./platform/frame-scheduler.js";
export { createAssetService } from "./render/assets/asset-service.js";
export { diagnosticsOf } from "./render/paint/decorations.js";
export type { InteractionLayer } from "./render/paint/interaction-layer.js";
export { createInteractionLayer } from "./render/paint/interaction-layer.js";
export { detailLevel, detailPolicy } from "./render/paint/level-of-detail.js";
export type {
  SceneLayerDeps,
  ScenePaintStats,
} from "./render/paint/scene-layer.js";
export {
  DEFAULT_Z_ORDER,
  EMPTY_VIEW_STATE,
  paintScene,
} from "./render/paint/scene-layer.js";
export type { TextMeasurer } from "./render/presets/text-measure.js";
export { createTextMeasurer } from "./render/presets/text-measure.js";
export { paintGrid } from "./render/primitives/grid.js";
export {
  drawPlaceholder,
  placeholderNodePainter,
} from "./render/primitives/placeholder.js";
export {
  boxNodePainter,
  fallbackConnectionPainter,
  fallbackNodePainter,
  fallbackPortGlyphPainter,
} from "./render/registries/fallback-painters.js";
export { resolveStyle } from "./render/theme/resolve-style.js";
