/**
 * Entity records (MOD-04 durable data and application payloads).
 *
 * Records are immutable: an update replaces the record object, so a kept reference keeps
 * showing the old state. They hold no ephemeral interaction state and no derived caches.
 */
import type { ConnectionId, NodeId, PortId } from "../../base/ids/ids.js";
import type { QuarterTurns, Size, Vec2 } from "./values.js";

/** JSON-compatible, deep-readonly application data, opaque to the library. */
export type Payload =
  | null
  | boolean
  | number
  | string
  | readonly Payload[]
  | { readonly [key: string]: Payload };

export type PortDirection = "input" | "output" | "undirected";

/** Maximum simultaneous attachments for a port: an integer >= 0 or "unlimited". */
export type AttachmentLimit = number | "unlimited";

/** Actions whose permission a record may override (enforced by later changes). */
export type CapabilityAction =
  | "move"
  | "resize"
  | "rotate"
  | "mirror"
  | "edit"
  | "connect"
  | "disconnect"
  | "delete";

export type CapabilityOverrides = Readonly<
  Partial<Record<CapabilityAction, boolean>>
>;

export interface NodeRecord {
  readonly id: NodeId;
  readonly type: string;
  /** World units. */
  readonly position: Vec2;
  readonly size: Size;
  readonly rotation: QuarterTurns;
  readonly mirrored: boolean;
  /** Paint order key; ties are broken by insertion sequence. */
  readonly z: number;
  /** Presentation order of this node's ports. */
  readonly ports: readonly PortId[];
  readonly title?: string;
  readonly status?: string;
  readonly payload: Payload;
  readonly capabilities?: CapabilityOverrides;
}

/** Node-local placement hint in the unrotated body frame; refined by geometry later. */
export interface PortPlacement {
  /** Fractions of the body box, 0..1. */
  readonly x: number;
  readonly y: number;
  /** Optional outward direction. */
  readonly normal?: Vec2;
}

export interface PortRecord {
  readonly id: PortId;
  readonly node: NodeId;
  readonly direction: PortDirection;
  readonly typeKey: string;
  readonly limit: AttachmentLimit;
  readonly label?: string;
  readonly placement?: PortPlacement;
}

export interface Endpoint {
  readonly node: NodeId;
  readonly port: PortId;
}

export interface ConnectionRecord {
  readonly id: ConnectionId;
  /** "default" unless a policy sets another kind. */
  readonly kind: string;
  /** Order carries no meaning when the connection is undirected. */
  readonly from: Endpoint;
  readonly to: Endpoint;
}
