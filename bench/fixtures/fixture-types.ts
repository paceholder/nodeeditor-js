/**
 * Node-type keys and registrations used by fixtures. Kept apart from the generator so the
 * generator itself imports no runtime code.
 */
import {
  createCardGeometry,
  createGeometryRegistry,
  createImageSymbolGeometry,
  createNodeTypeRegistry,
  createOrthogonalRouter,
  createRouteRegistry,
  type GeometryRegistry,
  type NodeTypeRegistry,
  type RouteRegistry,
} from "nodeeditor-js";

import { CARD_TYPE_KEY, SYMBOL_TYPE_KEY } from "./generate-fixture.js";

export const SYMBOL_TYPE = SYMBOL_TYPE_KEY;
export const CARD_TYPE = CARD_TYPE_KEY;

export function createFixtureNodeTypes(): NodeTypeRegistry {
  const registry = createNodeTypeRegistry();
  registry.register({
    type: SYMBOL_TYPE,
    label: "Symbol",
    defaultSize: { width: 64, height: 64 },
  });
  registry.register({
    type: CARD_TYPE,
    label: "Card",
    defaultSize: { width: 100, height: 80 },
  });
  return registry;
}

export function createFixtureGeometry(): GeometryRegistry {
  const registry = createGeometryRegistry();
  registry.register(SYMBOL_TYPE, createImageSymbolGeometry());
  registry.register(CARD_TYPE, createCardGeometry());
  return registry;
}

/** How fixture connections are routed: the library default, or all orthogonal. */
export type FixtureRoutes = "bezier" | "orthogonal";

/** Bezier for every kind, or orthogonal for every kind with rounded corners (D9). */
export function createFixtureRoutes(mode: FixtureRoutes): RouteRegistry {
  return mode === "orthogonal"
    ? createRouteRegistry({
        default: createOrthogonalRouter({ cornerRadius: 6 }),
      })
    : createRouteRegistry();
}
