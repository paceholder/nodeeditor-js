/**
 * Scene and index construction, culling queries and picking on F-LARGE, with
 * Bezier routes and again with every connection orthogonal (radius 6).
 */
import { rect } from "@paceholder/nodeeditor-js";
import { test } from "vitest";
import { F_LARGE, worldSize } from "../fixtures/fixture-specs.js";
import type { FixtureRoutes } from "../fixtures/fixture-types.js";
import { type Case, runCases, saveResults } from "./measure.js";
import { buildScene, loadFixture, randomPoints } from "./setup.js";

const { model } = loadFixture(F_LARGE);
const scenes = {
  bezier: buildScene(model),
  orthogonal: buildScene(model, "orthogonal"),
};
const points = randomPoints(F_LARGE, 10_000);
// Fit-all zoom at 1440x900 (5% margin): every node of F-LARGE is in view.
const world = worldSize(F_LARGE);
const fitZoom = Math.min(1440 / world.w, 900 / world.h) * 0.95;
// The visible world rectangle of that fit-all viewport: the world box plus a margin,
// which is what the view queries (and what the full-view cache serves).
const fitView = rect<"world">(
  world.w / 2 - 1440 / fitZoom / 2,
  world.h / 2 - 900 / fitZoom / 2,
  1440 / fitZoom,
  900 / fitZoom,
);
let next = 0;
const take = (): { x: number; y: number } => {
  next = (next + 1) % points.length;
  return points[next] as { x: number; y: number };
};

/** The scene rows for one route mode; orthogonal rows carry the route in their name. */
function sceneCases(routes: FixtureRoutes): Case[] {
  const scene = scenes[routes];
  const fixture = F_LARGE.name;
  const label = (name: string) =>
    routes === "bezier" ? name : `${name}, ${routes}`;
  return [
    {
      name: label("scene + index build"),
      metric: "projectionBuildMs",
      fixture,
      iterations: 10,
      fn: () => {
        buildScene(model, routes).dispose();
      },
    },
    // A 1440x900 CSS px viewport in world units at zoom 1 and at zoom 0.5.
    {
      name: label("culling query 1440x900 at zoom 1"),
      metric: "candidateQueryMs",
      fixture,
      fn: () => {
        const p = take();
        scene.queryRect(rect(p.x, p.y, 1440, 900));
      },
    },
    {
      name: label("culling query 1440x900 at zoom 0.5"),
      metric: "candidateQueryMs",
      fixture,
      fn: () => {
        const p = take();
        scene.queryRect(rect(p.x, p.y, 2880, 1800));
      },
    },
    {
      name: label("pick at random point (zoom 1)"),
      metric: "pickMs",
      fixture,
      fn: () => {
        scene.pick(take(), { zoom: 1 });
      },
    },
    // The overview navigation target rule: the overview, where the whole fixture is the query and the pick tolerance
    // in world units is large.
    {
      name: label("pick at random point (fit-all zoom)"),
      metric: "pickMs",
      fixture,
      fn: () => {
        scene.pick(take(), { zoom: fitZoom });
      },
    },
    {
      name: label("pick at random point (fit-all zoom, ports hidden)"),
      metric: "pickMs",
      fixture,
      fn: () => {
        scene.pick(take(), { zoom: fitZoom, ports: false });
      },
    },
    {
      name: label("culling query at fit-all"),
      metric: "candidateQueryMs",
      fixture,
      fn: () => {
        scene.queryRect(rect(0, 0, world.w, world.h));
      },
    },
    {
      name: label("culling query at fit-all viewport"),
      metric: "candidateQueryMs",
      fixture,
      fn: () => {
        scene.queryRect(fitView);
      },
    },
  ];
}

test("F-LARGE scene (headless)", async ({ bench }) => {
  const rows = await runCases(bench, [
    ...sceneCases("bezier"),
    ...sceneCases("orthogonal"),
  ]);
  saveResults("scene", rows);
}, 120_000);
