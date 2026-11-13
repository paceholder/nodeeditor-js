export type { Affine2 } from "./affine.js";
export {
  affine,
  applyPoint,
  applyVector,
  compose,
  determinant,
  identity,
  invert,
} from "./affine.js";
export { bezierPath, straightPath } from "./connection-paths.js";
export type { GeometryRegistry } from "./geometry-registry.js";
export { createGeometryRegistry } from "./geometry-registry.js";
export type { GroupFrameMetrics, GroupFramePart } from "./group-frame.js";
export { groupFrame, groupLockBox, groupTitleStrip } from "./group-frame.js";
export {
  checkWorldPoint,
  clampZoom,
  MAX_DPR,
  MAX_ZOOM,
  MIN_DPR,
  MIN_ZOOM,
} from "./limits.js";
export type {
  NodeContentField,
  NodeGeometry,
  NodeView,
  PortAnchor,
} from "./node-geometry.js";
export { DEFAULT_CAPTURE_RADIUS_PX } from "./node-geometry.js";
export type { NodePlacement } from "./node-transform.js";
export { nodeTransform } from "./node-transform.js";
export type {
  EndTangents,
  NearestPoint,
  PathGeometry,
} from "./path-geometry.js";
export {
  endTangents,
  nearestPoint,
  pathBounds,
  pathDistance,
  pathPointAt,
} from "./path-geometry.js";
export type { Polyline } from "./polyline.js";
export { polylinePath, polylineVertices } from "./polyline.js";
export type { Orientation, Side } from "./port-layout.js";
export type { CardOptions } from "./presets/card-geometry.js";
export { createCardGeometry } from "./presets/card-geometry.js";
export type { ImageSymbolOptions } from "./presets/image-symbol-geometry.js";
export { createImageSymbolGeometry } from "./presets/image-symbol-geometry.js";
export {
  rectCenter,
  rectContainsPoint,
  rectContainsRect,
  rectFromPoints,
  rectsIntersect,
  transformRect,
  unionRects,
} from "./rect.js";
export type { Shape } from "./shapes.js";
export {
  ellipseShape,
  polygonShape,
  rectShape,
  roundRectShape,
  shapeBounds,
  shapeContains,
  shapeDistance,
} from "./shapes.js";
export type { Point, Rect, Space } from "./spaces.js";
export { point, rect } from "./spaces.js";
export type { Viewport } from "./viewport-transform.js";
export {
  createViewport,
  DEFAULT_VIEWPORT,
  deviceMatrix,
  viewportMatrix,
  viewportToDevice,
  viewportToWorld,
  worldToViewport,
  zoomAt,
} from "./viewport-transform.js";
