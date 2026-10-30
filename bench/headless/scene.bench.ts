/** Scene and index construction, culling queries and picking on F-LARGE. */
import { rect } from "nodeeditor-js";
import { test } from "vitest";
import { F_LARGE, worldSize } from "../fixtures/fixture-specs.js";
import { runCases, saveResults } from "./measure.js";
import { buildScene, loadFixture, randomPoints } from "./setup.js";

const { model } = loadFixture(F_LARGE);
const scene = buildScene(model);
const points = randomPoints(F_LARGE, 10_000);
// Fit-all zoom at 1440x900 (5% margin): every node of F-LARGE is in view.
const world = worldSize(F_LARGE);
const fitZoom = Math.min(1440 / world.w, 900 / world.h) * 0.95;
let next = 0;
const take = (): { x: number; y: number } => {
  next = (next + 1) % points.length;
  return points[next] as { x: number; y: number };
};

test("F-LARGE scene (headless)", async ({ bench }) => {
  const fixture = F_LARGE.name;
  const rows = await runCases(bench, [
    {
      name: "scene + index build",
      metric: "projectionBuildMs",
      fixture,
      iterations: 10,
      fn: () => {
        buildScene(model).dispose();
      },
    },
    // A 1440x900 CSS px viewport in world units at zoom 1 and at zoom 0.5.
    {
      name: "culling query 1440x900 at zoom 1",
      metric: "candidateQueryMs",
      fixture,
      fn: () => {
        const p = take();
        scene.queryRect(rect(p.x, p.y, 1440, 900));
      },
    },
    {
      name: "culling query 1440x900 at zoom 0.5",
      metric: "candidateQueryMs",
      fixture,
      fn: () => {
        const p = take();
        scene.queryRect(rect(p.x, p.y, 2880, 1800));
      },
    },
    {
      name: "pick at random point (zoom 1)",
      metric: "pickMs",
      fixture,
      fn: () => {
        scene.pick(take(), { zoom: 1 });
      },
    },
    // The overview navigation target rule: the overview, where the whole fixture is the query and the pick tolerance
    // in world units is large.
    {
      name: "pick at random point (fit-all zoom)",
      metric: "pickMs",
      fixture,
      fn: () => {
        scene.pick(take(), { zoom: fitZoom });
      },
    },
    {
      name: "culling query at fit-all",
      metric: "candidateQueryMs",
      fixture,
      fn: () => {
        scene.queryRect(rect(0, 0, world.w, world.h));
      },
    },
  ]);
  saveResults("scene", rows);
}, 120_000);
