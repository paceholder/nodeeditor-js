/**
 * Geometry registry keyed by node type (NOD-07, NOD-08).
 *
 * Unknown types fall back to the placeholder geometry (a rectangle of the stored size with
 * evenly spaced ports), so a node of an unregistered type stays paintable and pickable.
 * Registration is independent of painter registration.
 */
import {
  err,
  ok,
  type Rejection,
  type Result,
  rejectionOf,
} from "../../base/result.js";
import type { NodeGeometry } from "./node-geometry.js";
import { createImageSymbolGeometry } from "./presets/image-symbol-geometry.js";

export const placeholderGeometry: NodeGeometry = createImageSymbolGeometry();

export interface GeometryRegistry {
  /** Geometry for the type, or the placeholder when none is registered. */
  get(type: string): NodeGeometry;
  has(type: string): boolean;
  /** Rejects `duplicate-type` when the type already has a geometry. */
  register(type: string, geometry: NodeGeometry): Result<void, Rejection>;
  /** Register or overwrite; subscribers learn which type changed. */
  replace(type: string, geometry: NodeGeometry): void;
  /** Called with the affected type key after a registration changes. */
  onChange(handler: (type: string) => void): () => void;
}

export function createGeometryRegistry(
  fallback: NodeGeometry = placeholderGeometry,
): GeometryRegistry {
  const byType = new Map<string, NodeGeometry>();
  const handlers = new Set<(type: string) => void>();
  const notify = (type: string): void => {
    for (const h of [...handlers]) h(type);
  };
  return {
    get: (type) => byType.get(type) ?? fallback,
    has: (type) => byType.has(type),
    register(type, geometry) {
      if (byType.has(type)) {
        return err(
          rejectionOf("duplicate-type", `Geometry for "${type}" exists`, [
            type,
          ]),
        );
      }
      byType.set(type, geometry);
      notify(type);
      return ok(undefined);
    },
    replace(type, geometry) {
      byType.set(type, geometry);
      notify(type);
    },
    onChange(handler) {
      handlers.add(handler);
      return () => handlers.delete(handler);
    },
  };
}
