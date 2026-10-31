/**
 * Size-limit resolution.
 *
 * Layers, each replacing only the bounds it gives: the library default (`min` 1 x 1,
 * `max` unbounded), the node type's `sizeLimits`, then the host hook, which sees the
 * record and may refine the limits per instance (for example from the payload). Limits
 * are checked by resize commands only; raw patches, undo and load keep any size.
 */
import type { NodeRecord } from "../../data/model/records.js";
import type { Size } from "../../data/model/values.js";
import {
  DEFAULT_MIN_SIZE,
  type SizeLimits,
} from "../../data/node-types/definition.js";
import type { NodeTypeRegistry } from "../../data/node-types/registry.js";

/** Limits with both bounds present; `max` may hold `Infinity`. */
export interface ResolvedSizeLimits {
  readonly min: Size;
  readonly max: Size;
}

/**
 * Host hook: refine the limits of one node. Return `undefined` to keep the type's. A
 * result whose `min` exceeds its `max` is a host bug; `max` is widened to `min`.
 */
export type SizeLimitPolicy = (
  node: NodeRecord,
  fromType: ResolvedSizeLimits,
) => SizeLimits | undefined;

const UNBOUNDED: Size = {
  width: Number.POSITIVE_INFINITY,
  height: Number.POSITIVE_INFINITY,
};

export const DEFAULT_SIZE_LIMITS: ResolvedSizeLimits = {
  min: DEFAULT_MIN_SIZE,
  max: UNBOUNDED,
};

function refine(
  base: ResolvedSizeLimits,
  limits: SizeLimits | undefined,
): ResolvedSizeLimits {
  if (!limits) return base;
  const min = limits.min ?? base.min;
  const max = limits.max ?? base.max;
  return {
    min,
    max: {
      width: Math.max(max.width, min.width),
      height: Math.max(max.height, min.height),
    },
  };
}

export function resolveSizeLimits(
  node: NodeRecord,
  registry: NodeTypeRegistry,
  policy?: SizeLimitPolicy,
): ResolvedSizeLimits {
  const fromType = refine(
    DEFAULT_SIZE_LIMITS,
    registry.get(node.type)?.sizeLimits,
  );
  return policy ? refine(fromType, policy(node, fromType)) : fromType;
}

/** Whether `size` lies inside `limits` on both axes. */
export function withinLimits(size: Size, limits: ResolvedSizeLimits): boolean {
  return (
    size.width >= limits.min.width &&
    size.height >= limits.min.height &&
    size.width <= limits.max.width &&
    size.height <= limits.max.height
  );
}
