/**
 * Node type registry (NOD-01).
 *
 * Each model owns its own registry; types are registered independently, and listing
 * follows registration order so results are deterministic (MOD-08).
 */
import { ok, type Result, reject } from "../../base/result.js";
import type { Size } from "../model/values.js";
import {
  DEFAULT_MIN_SIZE,
  type NodeTypeDefinition,
  type SizeLimits,
} from "./definition.js";

export interface NodeTypeRegistry {
  /**
   * Fails with `duplicate-type` if the key is already registered, and with
   * `malformed-record` for an empty key or inconsistent `sizeLimits`.
   */
  register(definition: NodeTypeDefinition): Result<void>;
  get(type: string): NodeTypeDefinition | undefined;
  has(type: string): boolean;
  /** Creatable types in registration order. */
  creatable(): readonly NodeTypeDefinition[];
}

export function createNodeTypeRegistry(): NodeTypeRegistry {
  const types = new Map<string, NodeTypeDefinition>();
  return {
    register(definition) {
      if (typeof definition.type !== "string" || definition.type === "") {
        return reject("malformed-record", "Node type key must not be empty");
      }
      if (types.has(definition.type)) {
        return reject(
          "duplicate-type",
          `Node type ${definition.type} is already registered`,
          [definition.type],
        );
      }
      const limits = definition.sizeLimits
        ? sizeLimitsProblem(definition.sizeLimits)
        : undefined;
      if (limits) {
        return reject(
          "malformed-record",
          `Node type ${definition.type} has invalid size limits: ${limits}`,
          [definition.type],
        );
      }
      types.set(definition.type, definition);
      return ok(undefined);
    },
    get: (type) => types.get(type),
    has: (type) => types.has(type),
    creatable: () => [...types.values()].filter((d) => d.creatable !== false),
  };
}

const isBound = (v: number, infinite: boolean): boolean =>
  v >= 0 &&
  (Number.isFinite(v) || (infinite && v === Number.POSITIVE_INFINITY));

/**
 * Why a type's size limits are unusable (NOD-04a): a negative or non-finite bound (only
 * `max` may be `Infinity`), or a minimum above the maximum. A missing `min` counts as
 * the library minimum.
 */
function sizeLimitsProblem(limits: SizeLimits): string | undefined {
  const bounds = (size: Size | undefined, infinite: boolean) =>
    size === undefined ||
    (typeof size === "object" &&
      isBound(size.width, infinite) &&
      isBound(size.height, infinite));
  if (!bounds(limits.min, false)) return "min must be finite and non-negative";
  if (!bounds(limits.max, true)) return "max must be non-negative";
  const min = limits.min ?? DEFAULT_MIN_SIZE;
  const { max } = limits;
  if (max && (min.width > max.width || min.height > max.height))
    return "min exceeds max";
  return undefined;
}
