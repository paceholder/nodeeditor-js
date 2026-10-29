/**
 * Shared snapshot support (SNP-02, SER-02, SER-04, MOD-09): error collection and ordering
 * for the validator, size limits for untrusted input, and payload codecs.
 */
import {
  ok,
  type Rejection,
  type RejectionCode,
  type Result,
  reject,
} from "../../base/result.js";
import type { Payload } from "../../data/model/records.js";
import type { JsonValue } from "./json-value.js";
import type { SnapshotError } from "./snapshot-types.js";

export interface ErrorSink {
  readonly errors: SnapshotError[];
  add(
    code: RejectionCode,
    message: string,
    path: string,
    entities?: readonly string[],
  ): void;
}

export function createErrorSink(): ErrorSink {
  const errors: SnapshotError[] = [];
  return {
    errors,
    add(code, message, path, entities = []) {
      errors.push({ code, message, path, entities });
    },
  };
}

const TOKEN = /[^.[\]]+/gu;

/** Compare JSON paths segment by segment, with array indexes ordered numerically. */
export function comparePaths(a: string, b: string): number {
  const ta = a.match(TOKEN) ?? [];
  const tb = b.match(TOKEN) ?? [];
  for (let i = 0; i < Math.min(ta.length, tb.length); i += 1) {
    const x = ta[i] ?? "";
    const y = tb[i] ?? "";
    if (x === y) continue;
    const nx = /^\d+$/u.test(x) ? Number(x) : Number.NaN;
    const ny = /^\d+$/u.test(y) ? Number(y) : Number.NaN;
    if (!Number.isNaN(nx) && !Number.isNaN(ny)) return nx - ny;
    return x < y ? -1 : 1;
  }
  return ta.length - tb.length;
}

/** Deterministic order: by path, then code, then message. */
export function sortErrors(errors: readonly SnapshotError[]): SnapshotError[] {
  return [...errors].sort(
    (a, b) =>
      comparePaths(a.path, b.path) ||
      (a.code < b.code ? -1 : a.code > b.code ? 1 : 0) ||
      (a.message < b.message ? -1 : a.message > b.message ? 1 : 0),
  );
}

/** Prefix the path of an error raised on an inner value (used by documents). */
export function prefixError(
  error: SnapshotError,
  prefix: string,
): SnapshotError {
  const path =
    error.path === ""
      ? prefix
      : `${prefix}${error.path.startsWith("[") ? "" : "."}${error.path}`;
  return { ...error, path };
}

/** Size limits for untrusted input (SNP-02, SER-04). Hosts may lower them. */
export interface SnapshotLimits {
  readonly maxNodes: number;
  readonly maxConnections: number;
  readonly maxPortsPerNode: number;
  readonly maxPayloadDepth: number;
  /** Applies to text input of `loadDocument`, checked before parsing. */
  readonly maxDocumentChars: number;
}

export const DEFAULT_SNAPSHOT_LIMITS: SnapshotLimits = {
  maxNodes: 100_000,
  maxConnections: 200_000,
  maxPortsPerNode: 1024,
  maxPayloadDepth: 64,
  maxDocumentChars: 64 * 1024 * 1024,
};

export function resolveLimits(
  limits: Partial<SnapshotLimits> | undefined,
): SnapshotLimits {
  return { ...DEFAULT_SNAPSHOT_LIMITS, ...limits };
}

/**
 * Payload codecs (SER-02).
 *
 * Payloads default to plain JSON. A node type whose payload holds other values registers
 * a codec that converts it to JSON on save and back on load. Each registry is owned by
 * the caller; there is no global registry.
 */
export interface PayloadCodec {
  encode(value: Payload): Result<JsonValue, Rejection>;
  decode(json: JsonValue): Result<Payload, Rejection>;
}

export interface PayloadCodecRegistry {
  /** Fails with `duplicate-type` if the node type already has a codec. */
  register(type: string, codec: PayloadCodec): Result<void, Rejection>;
  get(type: string): PayloadCodec | undefined;
}

export function createPayloadCodecRegistry(): PayloadCodecRegistry {
  const codecs = new Map<string, PayloadCodec>();
  return {
    register(type, codec) {
      if (codecs.has(type)) {
        return reject("duplicate-type", `A codec for ${type} already exists`, [
          type,
        ]);
      }
      codecs.set(type, codec);
      return ok(undefined);
    },
    get: (type) => codecs.get(type),
  };
}
