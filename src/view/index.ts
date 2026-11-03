// Framework-independent browser view (Canvas2D symbol renderer, tools, overlays): what a
// host needs to mount and customize an editor. Core names come from `nodeeditor-js` and
// building blocks from `nodeeditor-js/view/advanced`; no name has two paths.
// Browser APIs may only be touched during explicit mount, never at import time.

export type {
  ConnectionChoiceOption,
  ConnectionChoiceRequest,
  ConnectionChooser,
} from "./interact/choice/choice-types.js";
export type {
  CopyArgs,
  PasteArgs,
} from "./interact/clipboard/clipboard-commands.js";
export type {
  ClipboardEventMap,
  ClipboardOptions,
  CopyOutcome,
  CopyReport,
  PasteOutcome,
  PasteReport,
  SystemClipboard,
  TextSink,
} from "./interact/clipboard/clipboard-types.js";
export type { ViewClipboard } from "./interact/clipboard/view-clipboard.js";
export type { NudgeArgs } from "./interact/commands/builtin-commands.js";
export { COMMAND_IDS } from "./interact/commands/builtin-commands.js";
export type {
  CommandContext,
  CommandInfo,
  CommandOutcome,
  CommandRegistry,
  EditorCommand,
} from "./interact/commands/command-registry.js";
export type { EditableModel } from "./interact/commands/editable-model.js";
export type {
  KeyBinding,
  KeyLike,
  Keymap,
  Platform,
  ResolvedKey,
} from "./interact/commands/keymap.js";
export { DEFAULT_KEYMAP } from "./interact/commands/keymap.js";
export type {
  MirrorArgs,
  RotateArgs,
} from "./interact/commands/transform-commands.js";
export { VIEW_COMMAND_IDS } from "./interact/commands/view-commands.js";
export type {
  ContextMenuEvent,
  ContextMenuInvocation,
  ContextMenuTarget,
  ViewEventMap,
} from "./interact/context-menu/context-menu-types.js";
export type {
  OverlayAnchor,
  OverlayHandle,
} from "./interact/overlay/overlay-host.js";
export type { PresenceEntry } from "./interact/overlay/presence.js";
export { createOrthogonalSegmentEditor } from "./interact/route-edit/orthogonal-segment-editor.js";
export type {
  ReadonlySelection,
  SelectionChange,
  SelectionEvent,
  SelectionKey,
  SelectionModel,
} from "./interact/selection/selection-model.js";
export {
  connectionKey,
  nodeKey,
} from "./interact/selection/selection-model.js";
export type { AutoPanOptions } from "./interact/tools/auto-pan.js";
export { DEFAULT_AUTO_PAN } from "./interact/tools/auto-pan.js";
export { connectTool } from "./interact/tools/connect-tool.js";
export { defaultToolSlots } from "./interact/tools/default-tools.js";
export { emptyPanTool } from "./interact/tools/empty-pan-tool.js";
export { marqueeTool } from "./interact/tools/marquee-tool.js";
export { panTool } from "./interact/tools/pan-tool.js";
export { createRouteEditTool } from "./interact/tools/route-edit-tool.js";
export { selectMoveTool } from "./interact/tools/select-move-tool.js";
export type { ToolOptions } from "./interact/tools/thresholds.js";
export { DEFAULT_TOOL_OPTIONS } from "./interact/tools/thresholds.js";
export type { ToolSlot } from "./interact/tools/tool-router.js";
export { toolSlot } from "./interact/tools/tool-router.js";
export type {
  CancelReason,
  CandidateState,
  ChoiceRelease,
  ConnectCandidate,
  ConnectionEvaluation,
  CursorKind,
  Modifiers,
  PointerInput,
  PointerType,
  PressInfo,
  Tool,
  ToolContext,
  ToolEffect,
  ToolInput,
  ToolPreview,
  Transition,
  ViewportOp,
} from "./interact/tools/tool-types.js";
export { NO_MODIFIERS } from "./interact/tools/tool-types.js";
export { wheelZoom } from "./interact/tools/wheel-zoom.js";
export type { InputOptions, ViewHandle, ViewOptions } from "./mount-view.js";
export { mountView } from "./mount-view.js";
export type { FrameClock, LayerName } from "./platform/frame-scheduler.js";
export type { ViewModel } from "./platform/model-binding.js";
export type { RenderStats } from "./platform/render-stats.js";
export type { ViewportState } from "./platform/viewport-state.js";
export type {
  AssetService,
  AssetStats,
} from "./render/assets/asset-service.js";
export type {
  AssetDiagnostic,
  AssetDrawer,
  AssetFailureCode,
  AssetOptions,
  AssetResolver,
  AssetSource,
  AssetStatus,
  DrawResult,
} from "./render/assets/asset-types.js";
export type { SvgInfo, SvgScreen } from "./render/assets/svg-safety.js";
export { screenSvg } from "./render/assets/svg-safety.js";
export type { GestureBitmapOptions } from "./render/paint/gesture-bitmap.js";
export type { InteractionPainter } from "./render/paint/interaction-layer.js";
export type {
  DetailLevel,
  DetailPolicy,
} from "./render/paint/level-of-detail.js";
export type { ViewState } from "./render/paint/scene-layer.js";
export type { CardPainterOptions } from "./render/presets/card-painter.js";
export { createCardPainter } from "./render/presets/card-painter.js";
export type { ConnectionPainterOptions } from "./render/presets/connection-painter.js";
export { createConnectionPainter } from "./render/presets/connection-painter.js";
export type { ImageSymbolPainterOptions } from "./render/presets/image-symbol-painter.js";
export {
  createImageSymbolPainter,
  payloadString,
} from "./render/presets/image-symbol-painter.js";
export type { PortGlyphOptions } from "./render/presets/port-glyph-painter.js";
export { createPortGlyphPainter } from "./render/presets/port-glyph-painter.js";
export type { PaintFrame } from "./render/primitives/frame.js";
export type {
  BackgroundPainter,
  ConnectionPainter,
  ConnectionPaintInput,
  DiagnosticBadge,
  NodePainter,
  NodePaintInput,
  PortGlyphInput,
  PortGlyphPainter,
} from "./render/registries/painter-types.js";
export type {
  PainterRegistries,
  PainterRegistry,
  PainterSlot,
} from "./render/registries/painters.js";
export { createPainterRegistries } from "./render/registries/painters.js";
export type {
  RouteCursor,
  RouteEditContext,
  RouteEditor,
  RouteEditorRegistry,
  RouteHandle,
  RouteView,
} from "./render/registries/route-editor-registry.js";
export { createRouteEditorRegistry } from "./render/registries/route-editor-registry.js";
export type { ResolvedStyle, StyleKey } from "./render/theme/resolve-style.js";
export type {
  PortShape,
  StyleTokens,
  ThemeInput,
  ThemeTokens,
} from "./render/theme/tokens.js";
export { DEFAULT_THEME, mergeTheme } from "./render/theme/tokens.js";
