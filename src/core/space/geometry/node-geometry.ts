/**
 * The node geometry contract (GEO-02b, NOD-02, NOD-08).
 *
 * A geometry answers four questions in node-local space (origin at the body center),
 * independently of any painter: body bounds, precise hit shape, painted bounds, and port
 * anchors with outward unit normals. Painters never supply geometry.
 */

import type { PortId } from "../../base/ids/ids.js";
import type { NodeRecord, PortRecord } from "../../data/model/records.js";
import type { Shape } from "./shapes.js";
import type { Point, Rect } from "./spaces.js";

/** Read-only node snapshot with its ports in presentation order. */
export interface NodeView {
  readonly node: NodeRecord;
  readonly ports: readonly PortRecord[];
}

export interface PortAnchor {
  readonly portId: PortId;
  readonly position: Point<"local">;
  /** Outward unit normal. */
  readonly normal: Point<"local">;
  /** Capture radius in CSS pixels (GEO-05, PRT-05); never scaled by zoom. */
  readonly captureRadiusPx: number;
}

export interface NodeGeometry {
  bodyBounds(view: NodeView): Rect<"local">;
  /** Precise hit shape. */
  hitShape(view: NodeView): Shape;
  /** Superset of the body: includes declared label and shadow margins (VIS-03). */
  paintedBounds(view: NodeView): Rect<"local">;
  /** One anchor per port, in model port order (MOD-08). */
  anchors(view: NodeView): readonly PortAnchor[];
}

/** Default screen-space capture radius when a geometry does not choose one. */
export const DEFAULT_CAPTURE_RADIUS_PX = 8;
