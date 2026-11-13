// Building blocks of the browser view: frame scheduling, DOM input, tool
// routing, layer painters and fallbacks, for hosts that assemble a view from parts.
// Mounting and customizing an editor needs only `@paceholder/nodeeditor-js/view`.
// Importing this module has no side effects.

export type {
  ChoiceState,
  ConnectionChoice,
  ConnectionChoiceHost,
} from "./interact/choice/connection-choice.js";
export { createConnectionChoice } from "./interact/choice/connection-choice.js";
export { createClipboardService } from "./interact/clipboard/clipboard-service.js";
export type {
  ClipboardService,
  ClipboardServiceDeps,
} from "./interact/clipboard/clipboard-types.js";
export { registerBuiltinCommands } from "./interact/commands/builtin-commands.js";
export { createCommandRegistry } from "./interact/commands/command-registry.js";
export { createKeymap } from "./interact/commands/keymap.js";
export type {
  ViewCommandDeps,
  ViewCommandOutcome,
  ViewCommands,
} from "./interact/commands/view-commands.js";
export { createViewCommands } from "./interact/commands/view-commands.js";
export type { FitOptions } from "./interact/commands/view-fit.js";
export { fitViewport, revealViewport } from "./interact/commands/view-fit.js";
export type {
  ContextMenuInput,
  ContextMenuInputDeps,
} from "./interact/context-menu/context-menu-input.js";
export { attachContextMenuInput } from "./interact/context-menu/context-menu-input.js";
export type {
  AutoPanDriver,
  AutoPanDriverDeps,
  AutoPanHost,
} from "./interact/input/auto-pan-driver.js";
export { createAutoPanDriver } from "./interact/input/auto-pan-driver.js";
export type { DomInput, DomInputDeps } from "./interact/input/dom-input.js";
export { attachDomInput } from "./interact/input/dom-input.js";
export type { EffectHost } from "./interact/input/effect-runner.js";
export { createEffectRunner } from "./interact/input/effect-runner.js";
export type { ViewEvents } from "./interact/input/view-events.js";
export { createViewEvents } from "./interact/input/view-events.js";
export { createSelectionModel } from "./interact/selection/selection-model.js";
export type { ViewSize } from "./interact/tools/auto-pan.js";
// The tool contract and the built-in tools: for hosts that write or reorder tools. The
// contract may change before 1.0.
export { connectTool } from "./interact/tools/connect-tool.js";
export { emptyPanTool } from "./interact/tools/empty-pan-tool.js";
export { createGroupFrameTool } from "./interact/tools/group-frame-tool.js";
export { marqueeTool } from "./interact/tools/marquee-tool.js";
export { panTool } from "./interact/tools/pan-tool.js";
export type {
  ResizeHandles,
  ResizeHandlesDeps,
} from "./interact/tools/resize-handles.js";
export { createResizeHandles } from "./interact/tools/resize-handles.js";
export { resizeTool } from "./interact/tools/resize-tool.js";
export { createRouteEditTool } from "./interact/tools/route-edit-tool.js";
export { selectMoveTool } from "./interact/tools/select-move-tool.js";
export { resolveToolOptions } from "./interact/tools/thresholds.js";
export type { ToolContextDeps } from "./interact/tools/tool-context.js";
export {
  capabilityProbe,
  createToolContext,
} from "./interact/tools/tool-context.js";
export type {
  Gesture,
  GestureChange,
  RouteResult,
  ToolRouter,
} from "./interact/tools/tool-router.js";
export { createToolRouter, toolSlot } from "./interact/tools/tool-router.js";
export type {
  ChoiceRelease,
  CursorKind,
  GestureCancellation,
  PointerInput,
  PointerType,
  PressInfo,
  Tool,
  ToolContext,
  ToolEffect,
  ToolInput,
  Transition,
  ViewportOp,
} from "./interact/tools/tool-types.js";
export { NO_MODIFIERS } from "./interact/tools/tool-types.js";
export { wheelZoom } from "./interact/tools/wheel-zoom.js";
export type { ContainerMetrics } from "./platform/dom/container-metrics.js";
export type { LayerStack } from "./platform/dom/layer-stack.js";
export type { FrameScheduler } from "./platform/frame-scheduler.js";
export { createFrameScheduler } from "./platform/frame-scheduler.js";
export { createAssetService } from "./render/assets/asset-service.js";
export type { InteractionLayer } from "./render/paint/interaction-layer.js";
export { createInteractionLayer } from "./render/paint/interaction-layer.js";
export { detailLevel, detailPolicy } from "./render/paint/level-of-detail.js";
export type {
  LocalCorner,
  ResizeHandle,
} from "./render/paint/previews/resize-handle.js";
export { resizeHandleOf } from "./render/paint/previews/resize-handle.js";
export type { ResizeHandleSource } from "./render/paint/previews/resize-handle-painter.js";
export { createResizeHandlePainter } from "./render/paint/previews/resize-handle-painter.js";
export type {
  SceneLayerDeps,
  ScenePaintStats,
} from "./render/paint/scene-layer.js";
export {
  DEFAULT_Z_ORDER,
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
