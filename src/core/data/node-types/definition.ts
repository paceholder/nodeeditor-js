/**
 * Model-level part of a node type.
 *
 * Appearance, geometry and painters are registered separately by type key, so changing
 * one never requires touching another. This definition holds only what the model needs:
 * label, creatability, default size and size limits, payload and port factories,
 * capability defaults.
 */

import type { Result } from "../../base/result.js";
import type {
  AttachmentLimit,
  CapabilityOverrides,
  Payload,
  PortDirection,
  PortPlacement,
} from "../model/records.js";
import type { Size, Vec2 } from "../model/values.js";

/** Description of one port to create. */
export interface PortSpec {
  readonly direction: PortDirection;
  readonly typeKey: string;
  /** Defaults to `defaultLimit(direction)`. */
  readonly limit?: AttachmentLimit;
  readonly label?: string;
  readonly placement?: PortPlacement;
}

/**
 * Minimum and maximum body size. Each bound is optional and replaces the
 * library default for its own field only: `min` defaults to 1 x 1, `max` to unbounded
 * (`Infinity`). Checked by resize commands, not by raw patches, undo or load.
 */
export interface SizeLimits {
  readonly min?: Size;
  readonly max?: Size;
}

/** The library's minimum body size: a zero-width node can be neither seen nor picked. */
export const DEFAULT_MIN_SIZE: Size = { width: 1, height: 1 };

export interface NodeTypeDefinition {
  /** Unique key stored on node records. */
  readonly type: string;
  readonly label: string;
  /** Defaults to true. Non-creatable types can still exist in loaded documents. */
  readonly creatable?: boolean;
  readonly defaultSize: Size;
  /** Bounds for resize commands; refined per node by the model's `sizeLimits` hook. */
  readonly sizeLimits?: SizeLimits;
  /** Called with the world position of the new node. A failure rejects the command. */
  readonly createPayload?: (ctx: {
    readonly position: Vec2;
  }) => Result<Payload>;
  /** Initial ports for a payload. */
  readonly ports?: (payload: Payload) => readonly PortSpec[];
  /** Type-level capability defaults; per-record overrides win. */
  readonly capabilities?: CapabilityOverrides;
}

/** Default attachment limit: inputs take one connection, others are unlimited. */
export function defaultLimit(direction: PortDirection): AttachmentLimit {
  return direction === "input" ? 1 : "unlimited";
}
