/**
 * Result and error primitives shared by every core module.
 *
 * Expected failures (invalid input, rejected edits) are returned as `Result` values.
 * `MisuseError` is thrown only for programmer errors, such as calling an API in a state
 * where it can never succeed.
 */

/** Structural rejection codes. Later changes extend this union. */
export type RejectionCode =
  | "malformed-id"
  | "malformed-record"
  | "duplicate-id"
  | "non-finite"
  | "dangling-endpoint"
  | "port-node-mismatch"
  | "invalid-limit"
  | "unknown-entity"
  | "conflict"
  | "dangling-reference"
  | "history-unavailable"
  | "disposed"
  // Node types and commands
  | "unknown-type"
  | "duplicate-type"
  | "not-creatable"
  | "factory-failed"
  // Connection policy
  | "same-port"
  | "direction-mismatch"
  | "type-mismatch"
  | "self-loop"
  | "duplicate-connection"
  | "capacity-exhausted"
  | "choice-required"
  | "pending-validation"
  // Capabilities
  | "capability-denied"
  // Snapshots and documents
  | "invalid-shape"
  | "unsupported-format"
  | "unsupported-version"
  | "unsupported-section"
  | "non-json-payload"
  | "limit-exceeded"
  // Geometry
  | "non-invertible"
  | "out-of-range";

/** Structured description of why a change or record was refused. */
export interface Rejection {
  readonly code: RejectionCode;
  readonly message: string;
  /** IDs (or ID-like descriptions) of the entities the rejection concerns. */
  readonly entities: readonly string[];
}

export type Result<T, E = Rejection> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E };

export function ok<T>(value: T): Result<T, never> {
  return { ok: true, value };
}

export function err<E>(error: E): Result<never, E> {
  return { ok: false, error };
}

/** Build a bare `Rejection` value (for APIs that return `Rejection | undefined`). */
export function rejectionOf(
  code: RejectionCode,
  message: string,
  entities: readonly string[] = [],
): Rejection {
  return { code, message, entities };
}

/** Build a failed `Result` holding a `Rejection`. */
export function reject(
  code: RejectionCode,
  message: string,
  entities: readonly string[] = [],
): Result<never, Rejection> {
  return err({ code, message, entities });
}

/** Thrown for programmer misuse only; never for expected failures. */
export class MisuseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MisuseError";
  }
}
