/** Snapshot validate, load, export and diff on F-LARGE. */
import {
  diffSnapshot,
  exportSnapshot,
  type GraphSnapshot,
  loadSnapshot,
  validateSnapshot,
} from "@paceholder/nodeeditor-js";
import { test } from "vitest";
import { F_LARGE } from "../fixtures/fixture-specs.js";
import { runCases, saveResults } from "./measure.js";
import { loadFixture, newModel } from "./setup.js";

const { snapshot, model } = loadFixture(F_LARGE);
const target = newModel();

// A target that differs from the model by 100 moved nodes.
const moved: GraphSnapshot = {
  ...snapshot,
  nodes: snapshot.nodes.map((n, i) =>
    i % 100 === 0
      ? { ...n, position: { x: n.position.x + 5, y: n.position.y } }
      : n,
  ),
};

test("F-LARGE snapshot (headless)", async ({ bench }) => {
  const fixture = F_LARGE.name;
  const rows = await runCases(bench, [
    {
      name: "snapshot validate",
      metric: "validateMs",
      fixture,
      iterations: 15,
      fn: () => {
        if (!validateSnapshot(snapshot).ok) throw new Error("invalid");
      },
    },
    {
      name: "snapshot load",
      metric: "loadMs",
      fixture,
      iterations: 15,
      fn: () => {
        if (!loadSnapshot(target, snapshot).ok) throw new Error("load failed");
      },
    },
    {
      name: "snapshot export",
      metric: "exportMs",
      fixture,
      iterations: 15,
      fn: () => {
        exportSnapshot(model);
      },
    },
    {
      name: "snapshot diff (100 nodes moved)",
      metric: "diffMs",
      fixture,
      iterations: 15,
      fn: () => {
        diffSnapshot(model.reader, moved);
      },
    },
  ]);
  saveResults("snapshot", rows);
}, 120_000);
