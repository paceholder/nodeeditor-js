// Building blocks of the browser view (PKG-01): frame scheduling, DOM input, tool
// routing, layer painters and fallbacks, for hosts that assemble a view from parts.
// Mounting and customizing an editor needs only `nodeeditor-js/view`.
// Importing this module has no side effects (REA-06).

export { registerBuiltinCommands } from "./interact/commands/builtin-commands.js";
export { createCommandRegistry } from "./interact/commands/command-registry.js";
export { isEditable } from "./interact/commands/editable-model.js";
export { createKeymap, detectPlatform } from "./interact/commands/keymap.js";
export type {
  ViewCommandDeps,
  ViewCommandOutcome,
  ViewCommands,
} from "./interact/commands/view-commands.js";
export { createViewCommands } from "./interact/commands/view-commands.js";
export type { FitOptions } from "./interact/commands/view-fit.js";
export { fitViewport, revealViewport } from "./interact/commands/view-fit.js";
export type { DomInput, DomInputDeps } from "./interact/input/dom-input.js";
export { attachDomInput } from "./interact/input/dom-input.js";
export type { EffectHost } from "./interact/input/effect-runner.js";
export { createEffectRunner } from "./interact/input/effect-runner.js";
export {
  applySelectionChange,
  createSelectionModel,
} from "./interact/selection/selection-model.js";
export { resolveToolOptions } from "./interact/tools/thresholds.js";
export type { ToolContextDeps } from "./interact/tools/tool-context.js";
export {
  capabilityProbe,
  createToolContext,
} from "./interact/tools/tool-context.js";
export type {
  Gesture,
  RouteResult,
  ToolRouter,
} from "./interact/tools/tool-router.js";
export { createToolRouter } from "./interact/tools/tool-router.js";
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
  HiddenIds,
  PreviewHost,
} from "./render/paint/previews/preview-host.js";
export {
  createHiddenIds,
  createPreviewHost,
} from "./render/paint/previews/preview-host.js";
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
