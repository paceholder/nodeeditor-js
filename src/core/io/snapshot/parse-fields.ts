/**
 * Field-level shape helpers for snapshot entries (SNP-02): type checks that report
 * `invalid-shape` with a JSON path instead of throwing.
 */
import type {
  CapabilityAction,
  CapabilityOverrides,
  PortPlacement,
} from "../../data/model/records.js";
import type { Vec2 } from "../../data/model/values.js";
import type { ErrorSink } from "./snapshot-errors.js";

export type Obj = Record<string, unknown>;

export function isObj(value: unknown): value is Obj {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const ACTIONS: ReadonlySet<string> = new Set<CapabilityAction>([
  "move",
  "resize",
  "rotate",
  "mirror",
  "edit",
  "connect",
  "disconnect",
  "delete",
]);
export const DIRECTIONS: ReadonlySet<unknown> = new Set([
  "input",
  "output",
  "undirected",
]);

/** Reports unknown keys (a silent drop would lose data) and returns whether all are known. */
export function onlyKeys(
  o: Obj,
  allowed: readonly string[],
  path: string,
  sink: ErrorSink,
): void {
  for (const key of Object.keys(o)) {
    if (!allowed.includes(key)) {
      sink.add("invalid-shape", `Unknown field "${key}"`, `${path}.${key}`);
    }
  }
}

export function num(
  o: Obj,
  key: string,
  path: string,
  sink: ErrorSink,
): number | undefined {
  const v = o[key];
  if (typeof v === "number") return v;
  sink.add("invalid-shape", `${key} must be a number`, `${path}.${key}`);
  return undefined;
}

export function optStr(
  o: Obj,
  key: string,
  path: string,
  sink: ErrorSink,
): string | undefined {
  const v = o[key];
  if (v === undefined || typeof v === "string") return v;
  sink.add("invalid-shape", `${key} must be a string`, `${path}.${key}`);
  return undefined;
}

export function reqStr(
  o: Obj,
  key: string,
  path: string,
  sink: ErrorSink,
): string | undefined {
  if (typeof o[key] === "string") return o[key];
  sink.add("invalid-shape", `${key} must be a string`, `${path}.${key}`);
  return undefined;
}

export function vec(
  value: unknown,
  path: string,
  sink: ErrorSink,
): Vec2 | undefined {
  if (!isObj(value)) {
    sink.add("invalid-shape", "Expected an object with x and y", path);
    return undefined;
  }
  onlyKeys(value, ["x", "y"], path, sink);
  const x = num(value, "x", path, sink);
  const y = num(value, "y", path, sink);
  return x === undefined || y === undefined ? undefined : { x, y };
}

export function placement(
  value: unknown,
  path: string,
  sink: ErrorSink,
): PortPlacement | undefined {
  if (!isObj(value)) {
    sink.add("invalid-shape", "placement must be an object", path);
    return undefined;
  }
  onlyKeys(value, ["x", "y", "normal"], path, sink);
  const x = num(value, "x", path, sink);
  const y = num(value, "y", path, sink);
  const normal =
    value.normal === undefined
      ? undefined
      : vec(value.normal, `${path}.normal`, sink);
  if (x === undefined || y === undefined) return undefined;
  if (value.normal !== undefined && normal === undefined) return undefined;
  return { x, y, ...(normal ? { normal } : {}) };
}

export function capabilities(
  value: unknown,
  path: string,
  sink: ErrorSink,
): CapabilityOverrides | undefined {
  if (!isObj(value)) {
    sink.add("invalid-shape", "capabilities must be an object", path);
    return undefined;
  }
  const out: Partial<Record<CapabilityAction, boolean>> = {};
  let good = true;
  for (const [key, v] of Object.entries(value)) {
    if (!ACTIONS.has(key) || typeof v !== "boolean") {
      sink.add(
        "invalid-shape",
        `capabilities.${key} must be a known action set to a boolean`,
        `${path}.${key}`,
      );
      good = false;
    } else out[key as CapabilityAction] = v;
  }
  return good ? out : undefined;
}
