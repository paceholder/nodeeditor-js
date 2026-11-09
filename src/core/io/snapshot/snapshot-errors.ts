/**
 * Shared snapshot support: error collection and ordering
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

/**
 * Collects errors up to a bound: hostile input with a million bad entries costs
 * a hundred error objects, not a million. Parsers tell whether an entry failed from
 * `count()`, which keeps counting past the bound.
 */
export interface ErrorSink {
  add(
    code: RejectionCode,
    message: string,
    path: string,
    entities?: readonly string[],
  ): void;
  /** Every error added so far, including those past the bound. */
  count(): number;
  /** The kept errors sorted by path, then one `limit-exceeded` entry if any were dropped. */
  report(): SnapshotError[];
}

export const DEFAULT_MAX_ERRORS = 100;

export function createErrorSink(max = DEFAULT_MAX_ERRORS): ErrorSink {
  const kept: SnapshotError[] = [];
  let total = 0;
  return {
    add(code, message, path, entities = []) {
      total += 1;
      if (kept.length < max) kept.push({ code, message, path, entities });
    },
    count: () => total,
    report() {
      const out = sortErrors(kept);
      const omitted = total - kept.length;
      if (omitted > 0) {
        out.push({
          code: "limit-exceeded",
          message: `${omitted} more errors were omitted; the limit is ${max}`,
          path: "",
          entities: [],
        });
      }
      return out;
    },
  };
}

/** A view of `sink` that files every error under `prefix` (an inner value's path). */
export function prefixedSink(sink: ErrorSink, prefix: string): ErrorSink {
  return {
    add(code, message, path, entities) {
      const at = prefixError(
        { code, message, path, entities: [] },
        prefix,
      ).path;
      sink.add(code, message, at, entities);
    },
    count: () => sink.count(),
    report: () => sink.report(),
  };
}

/** The message of anything thrown. */
export function thrownMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Run a check that reads untrusted input; a throw (a property getter, a proxy) becomes an
 * `invalid-shape` error at `path`, so validation keeps its never-throws contract.
 */
export function guarded<T>(
  run: () => Result<T, readonly SnapshotError[]>,
  path = "",
): Result<T, readonly SnapshotError[]> {
  try {
    return run();
  } catch (error) {
    return {
      ok: false,
      rejection: [
        {
          code: "invalid-shape",
          message: `The input could not be read: ${thrownMessage(error)}`,
          path,
          entities: [],
        },
      ],
    };
  }
}

/** Run a host payload codec step; a throw becomes a failed result. */
export function runCodec<T>(
  step: () => Result<T, Rejection>,
): Result<T, Rejection> {
  try {
    return step();
  } catch (error) {
    return reject(
      "non-json-payload",
      `The payload codec threw: ${thrownMessage(error)}`,
    );
  }
}

/** Add errors that were already built (decoded payloads, inner results). */
export function addErrors(
  sink: ErrorSink,
  errors: readonly SnapshotError[],
): void {
  for (const e of errors) sink.add(e.code, e.message, e.path, e.entities);
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

/** Size limits for untrusted input. Hosts may lower them. */
export interface SnapshotLimits {
  readonly maxNodes: number;
  readonly maxConnections: number;
  readonly maxPortsPerNode: number;
  readonly maxPayloadDepth: number;
  /** Route constraints on one connection; never above `MAX_ROUTE_CONSTRAINTS`. */
  readonly maxRouteConstraints: number;
  /** Applies to text input of `loadDocument`, checked before parsing. */
  readonly maxDocumentChars: number;
  /** Errors reported per validation; more are counted in one last entry. */
  readonly maxErrors: number;
}

export const DEFAULT_SNAPSHOT_LIMITS: SnapshotLimits = {
  maxNodes: 100_000,
  maxConnections: 200_000,
  maxPortsPerNode: 1024,
  maxPayloadDepth: 64,
  maxRouteConstraints: 256,
  maxDocumentChars: 64 * 1024 * 1024,
  maxErrors: DEFAULT_MAX_ERRORS,
};

export function resolveLimits(
  limits: Partial<SnapshotLimits> | undefined,
): SnapshotLimits {
  return { ...DEFAULT_SNAPSHOT_LIMITS, ...limits };
}

/**
 * Payload codecs.
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
