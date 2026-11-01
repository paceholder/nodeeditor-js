/** One-node-move patch with up to four incident connections on F-LARGE. */
import type { NodeId, Patch } from "nodeeditor-js";
import { test } from "vitest";
import { F_LARGE } from "../fixtures/fixture-specs.js";
import { runCases, saveResults } from "./measure.js";
import { buildScene, loadFixture } from "./setup.js";

const { model } = loadFixture(F_LARGE);
const scene = buildScene(model);

/** A node with the highest incident count that is still at most four. */
function pickNode(): NodeId {
  let best = model.reader.nodes()[0]?.id;
  let bestDegree = -1;
  for (const node of model.reader.nodes()) {
    const degree = model.reader.connectionsOfNode(node.id).length;
    if (degree <= 4 && degree > bestDegree) {
      best = node.id;
      bestDegree = degree;
      if (degree === 4) break;
    }
  }
  if (!best) throw new Error("empty fixture");
  return best;
}

const id = pickNode();
let flip = false;
function movePatch(): Patch {
  const from = model.reader.getNode(id)?.position;
  if (!from) throw new Error("node vanished");
  flip = !flip;
  return {
    ops: [
      {
        op: "update",
        entity: "node",
        id,
        fields: {
          position: {
            old: from,
            new: { x: from.x + (flip ? 3 : -3), y: from.y },
          },
        },
      },
    ],
  };
}

test("F-LARGE one-node move (headless)", async ({ bench }) => {
  const fixture = F_LARGE.name;
  const apply = (): void => {
    const r = model.submit(movePatch(), { history: "skip" });
    if (r.status !== "accepted") throw new Error("rejected");
  };
  // With the scene attached the patch also updates the touched index entries.
  const withScene = await runCases(bench, [
    {
      name: "patch apply + scene/index update",
      metric: "patchApplyMs",
      fixture,
      fn: apply,
    },
  ]);
  scene.dispose();
  // The same with every connection routed orthogonally.
  const orthogonal = buildScene(model, "orthogonal");
  const withOrthogonal = await runCases(bench, [
    {
      name: "patch apply + scene/index update, orthogonal",
      metric: "patchApplyMs",
      fixture,
      fn: apply,
    },
  ]);
  orthogonal.dispose();
  const modelOnly = await runCases(bench, [
    {
      name: "patch apply, model only",
      metric: "patchApplyMs",
      fixture,
      fn: apply,
    },
  ]);
  saveResults("patch", [...withScene, ...withOrthogonal, ...modelOnly]);
}, 120_000);
