/**
 * Route registry keyed by connection kind (ROU-01).
 *
 * Like the painter registries: a kind without a registration uses the default router,
 * Bezier unless the host passes another. Changing a registration notifies subscribers with
 * the kind, so a scene recomputes only that kind's paths; routes are presentation, so no
 * patch or history entry results (ROU-12).
 */
import {
  err,
  ok,
  type Rejection,
  type Result,
  rejectionOf,
} from "../../base/result.js";
import { createBezierRouter } from "./basic-routers.js";
import type { ConnectionRouter } from "./route-types.js";

export interface RouteRegistry {
  /** The router registered for `kind`, or the default router. */
  get(kind: string): ConnectionRouter;
  /** Used for unregistered kinds and for the connection-drag preview. */
  readonly defaultRouter: ConnectionRouter;
  has(kind: string): boolean;
  /** Rejects `duplicate-type` when the kind already has a router. */
  register(kind: string, router: ConnectionRouter): Result<void, Rejection>;
  /** Register or overwrite; subscribers learn which kind changed. */
  replace(kind: string, router: ConnectionRouter): void;
  /** Called with the affected kind after a registration changes. */
  onChange(handler: (kind: string) => void): () => void;
}

export interface RouteRegistryOptions {
  /** Router for unregistered kinds. Default: Bezier. */
  readonly default?: ConnectionRouter;
}

export function createRouteRegistry(
  options: RouteRegistryOptions = {},
): RouteRegistry {
  const defaultRouter = options.default ?? createBezierRouter();
  const byKind = new Map<string, ConnectionRouter>();
  const handlers = new Set<(kind: string) => void>();
  const notify = (kind: string): void => {
    for (const h of [...handlers]) h(kind);
  };
  return {
    get: (kind) => byKind.get(kind) ?? defaultRouter,
    defaultRouter,
    has: (kind) => byKind.has(kind),
    register(kind, router) {
      if (byKind.has(kind)) {
        return err(
          rejectionOf("duplicate-type", `Route for "${kind}" exists`, [kind]),
        );
      }
      byKind.set(kind, router);
      notify(kind);
      return ok(undefined);
    },
    replace(kind, router) {
      byKind.set(kind, router);
      notify(kind);
    },
    onChange(handler) {
      handlers.add(handler);
      return () => handlers.delete(handler);
    },
  };
}
