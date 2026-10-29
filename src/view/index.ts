// Framework-independent browser view (Canvas2D symbol renderer, tools, overlays): what a
// host needs to mount and customize an editor. Core names come from `nodeeditor-js` and
// building blocks from `nodeeditor-js/view/advanced`; no name has two paths (PKG-01).
// Browser APIs may only be touched during explicit mount, never at import time (REA-06).

export type {
  OverlayAnchor,
  OverlayHandle,
} from "./interact/overlay/overlay-host.js";
export type { PresenceEntry } from "./interact/overlay/presence.js";
export type { ViewHandle, ViewOptions } from "./mount-view.js";
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
export type { ResolvedStyle, StyleKey } from "./render/theme/resolve-style.js";
export type {
  PortShape,
  StyleTokens,
  ThemeInput,
  ThemeTokens,
} from "./render/theme/tokens.js";
export { DEFAULT_THEME, mergeTheme } from "./render/theme/tokens.js";
