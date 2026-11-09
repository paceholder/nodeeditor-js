/**
 * The graph snapshot: one plain, JSON-compatible shape for save/load, fixtures,
 * clipboard fragments and snapshot-mode adapters.
 *
 * Entries mirror the model records field for field. Ports are embedded in their node, in
 * presentation order. Fields that hold their default value are omitted (rotation 0,
 * mirrored false, z 0, limit "unlimited", kind "default"); load fills them back in.
 */
import type { IdCursor } from "../../base/ids/id-generator.js";
import type { Rejection } from "../../base/result.js";
import type {
  AttachmentLimit,
  CapabilityOverrides,
  PortDirection,
  PortPlacement,
  RouteConstraint,
} from "../../data/model/records.js";
import type { QuarterTurns, Size, Vec2 } from "../../data/model/values.js";
import type { JsonValue } from "./json-value.js";

/** Version of the snapshot shape and of the wrapping document. */
export const FORMAT_VERSION = 1;
export const SNAPSHOT_FORMAT = "@paceholder/nodeeditor-js/graph";
export const DOCUMENT_FORMAT = "@paceholder/nodeeditor-js/document";

export interface PortSnapshot {
  readonly id: string;
  readonly direction: PortDirection;
  readonly typeKey: string;
  readonly limit?: AttachmentLimit;
  readonly label?: string;
  readonly placement?: PortPlacement;
}

export interface NodeSnapshot {
  readonly id: string;
  readonly type: string;
  readonly position: Vec2;
  readonly size: Size;
  readonly rotation?: QuarterTurns;
  readonly mirrored?: boolean;
  readonly z?: number;
  readonly title?: string;
  readonly status?: string;
  readonly capabilities?: CapabilityOverrides;
  /** Presentation order. */
  readonly ports: readonly PortSnapshot[];
  readonly payload: JsonValue;
}

/** Endpoint with plain-string IDs; load brands them after validation. */
export interface EndpointSnapshot {
  readonly node: string;
  readonly port: string;
}

export interface ConnectionSnapshot {
  readonly id: string;
  readonly kind?: string;
  readonly from: EndpointSnapshot;
  readonly to: EndpointSnapshot;
  /** Route constraints; omitted when there are none. */
  readonly route?: readonly RouteConstraint[];
}

export interface GraphSnapshot {
  readonly format: typeof SNAPSHOT_FORMAT;
  readonly version: typeof FORMAT_VERSION;
  /** Generator cursor, omitted in fragments. */
  readonly idCursor?: IdCursor;
  /** Paint order: `(z, seq)` ascending. */
  readonly nodes: readonly NodeSnapshot[];
  /** Collection order. */
  readonly connections: readonly ConnectionSnapshot[];
  /** Reserved sections: must be empty until their capabilities land. */
  readonly assemblies?: readonly [];
  readonly references?: readonly [];
  readonly groups?: readonly [];
  readonly routes?: readonly [];
}

/** A structured import error: a rejection plus a JSON path. */
export interface SnapshotError extends Rejection {
  /** JSON path of the offending value, e.g. `nodes[3].ports[1].id`; "" for the root. */
  readonly path: string;
}

/** A non-fatal finding after a successful load. */
export interface SnapshotDiagnostic {
  readonly code: "unresolved-type";
  readonly node: string;
  readonly type: string;
  readonly path: string;
}

/** Every error code the snapshot validator and document loader can produce. */
export const SNAPSHOT_ERROR_CODES = [
  "invalid-shape",
  "unsupported-format",
  "unsupported-version",
  "unsupported-section",
  "non-json-payload",
  "limit-exceeded",
  "malformed-id",
  "malformed-record",
  "duplicate-id",
  "non-finite",
  "dangling-endpoint",
  "dangling-reference",
  "port-node-mismatch",
  "invalid-limit",
  "out-of-range",
] as const;
