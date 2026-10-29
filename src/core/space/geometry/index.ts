export type { Affine2 } from "./affine.js";
export {
  affine,
  applyPoint,
  applyVector,
  compose,
  determinant,
  identity,
  invert,
  isFiniteAffine,
} from "./affine.js";
export type { RouteMode } from "./connection-paths.js";
export {
  BEZIER_MAX_HANDLE,
  BEZIER_MIN_HANDLE,
  bezierPath,
  buildPath,
  straightPath,
} from "./connection-paths.js";
export type { GeometryRegistry } from "./geometry-registry.js";
export {
  createGeometryRegistry,
  placeholderGeometry,
} from "./geometry-registry.js";
export {
  checkDpr,
  checkWorldPoint,
  clampZoom,
  isInWorldRange,
  MAX_DPR,
  MAX_WORLD_COORD,
  MAX_ZOOM,
  MIN_DETERMINANT,
  MIN_DPR,
  MIN_ZOOM,
} from "./limits.js";
export type {
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
  isFinitePath,
  nearestPoint,
  pathBounds,
  pathDistance,
  pathPointAt,
} from "./path-geometry.js";
export type { Orientation, Side } from "./port-layout.js";
export type { CardOptions } from "./presets/card-geometry.js";
export { createCardGeometry } from "./presets/card-geometry.js";
export type { ImageSymbolOptions } from "./presets/image-symbol-geometry.js";
export { createImageSymbolGeometry } from "./presets/image-symbol-geometry.js";
export {
  inflateRect,
  intersectRects,
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
  isValidShape,
  polygonShape,
  rectShape,
  roundRectShape,
  shapeBounds,
  shapeContains,
  shapeDistance,
} from "./shapes.js";
export type { Point, Rect, Space } from "./spaces.js";
export { isFinitePoint, isFiniteRect, point, rect } from "./spaces.js";
export type { Viewport } from "./viewport-transform.js";
export {
  createViewport,
  DEFAULT_VIEWPORT,
  deviceMatrix,
  deviceToViewport,
  viewportMatrix,
  viewportToDevice,
  viewportToWorld,
  worldToViewport,
  zoomAt,
} from "./viewport-transform.js";
