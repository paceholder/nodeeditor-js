/** Shared setup for headless benches: a model loaded from a seeded fixture. */
import {
  createGeometryScene,
  createGraphModel,
  type GeometryScene,
  type GraphModel,
  type GraphSnapshot,
  loadSnapshot,
} from "nodeeditor-js";
import {
  DEFAULT_SEED,
  type FixtureSpec,
  worldSize,
} from "../fixtures/fixture-specs.js";
import {
  createFixtureGeometry,
  createFixtureNodeTypes,
  createFixtureRoutes,
  type FixtureRoutes,
} from "../fixtures/fixture-types.js";
import { generateFixture } from "../fixtures/generate-fixture.js";
import { createPrng } from "../fixtures/prng.js";

export interface Loaded {
  readonly snapshot: GraphSnapshot;
  readonly model: GraphModel;
}

export function newModel(): GraphModel {
  return createGraphModel({ registry: createFixtureNodeTypes() });
}

export function loadFixture(spec: FixtureSpec, seed = DEFAULT_SEED): Loaded {
  const snapshot = generateFixture(spec, seed);
  const model = newModel();
  const result = loadSnapshot(model, snapshot);
  if (!result.ok) throw new Error(`fixture ${spec.name} failed to load`);
  return { snapshot, model };
}

export function buildScene(
  model: GraphModel,
  routes: FixtureRoutes = "bezier",
): GeometryScene {
  return createGeometryScene(model, {
    registry: createFixtureGeometry(),
    routes: createFixtureRoutes(routes),
  });
}

/** Seeded points inside the world, for picking and culling. */
export function randomPoints(
  spec: FixtureSpec,
  count: number,
  seed = 7,
): { x: number; y: number }[] {
  const prng = createPrng(seed);
  const { w, h } = worldSize(spec);
  return Array.from({ length: count }, () => ({
    x: prng.next() * w,
    y: prng.next() * h,
  }));
}
