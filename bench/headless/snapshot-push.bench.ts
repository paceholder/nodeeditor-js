/**
 * Snapshot push is an incremental external change: the cost of pushing a whole snapshot
 * that differs from the displayed state by one moved node, into 500 and 5000 node models
 * on the snapshot adapter. Each iteration alternates between two snapshots, so every push
 * applies exactly one update. The "one pending edit" cases keep an unanswered edit of
 * another node, so the push also rebases it on a scratch copy of the confirmed state.
 */
import {
  createCounterIdGenerator,
  createSnapshotModel,
  type GraphSnapshot,
  type HostAnswer,
  type NodeId,
  type SnapshotModel,
} from "@paceholder/nodeeditor-js";
import { test } from "vitest";
import { customSpec, DEFAULT_SEED } from "../fixtures/fixture-specs.js";
import { createFixtureNodeTypes } from "../fixtures/fixture-types.js";
import { generateFixture } from "../fixtures/generate-fixture.js";
import { type Case, runCases, saveResults } from "./measure.js";

interface PushFixture {
  readonly name: string;
  readonly model: SnapshotModel;
  readonly base: GraphSnapshot;
  readonly moved: GraphSnapshot;
}

/** The host never answers: the edits it receives stay pending. */
const silentHost = (): Promise<HostAnswer> => new Promise(() => {});

function pushFixture(nodes: number, pending: boolean): PushFixture {
  const spec = customSpec(nodes);
  const base = generateFixture(spec, DEFAULT_SEED);
  const [first, second] = base.nodes;
  if (!first || !second) throw new Error("fixture too small");
  const moved: GraphSnapshot = {
    ...base,
    nodes: base.nodes.map((n, i) =>
      i === 0
        ? { ...n, position: { x: n.position.x + 5, y: n.position.y } }
        : n,
    ),
  };
  const model = createSnapshotModel({
    idGenerator: createCounterIdGenerator(),
    onSubmit: silentHost,
    registry: createFixtureNodeTypes(),
  });
  if (model.pushSnapshot(base).status !== "applied")
    throw new Error(`${spec.name} did not push`);
  if (pending) {
    const id = second.id as NodeId;
    const at = second.position;
    const sent = model.execute({
      kind: "moveNodes",
      moves: [{ node: id, position: { x: at.x, y: at.y + 7 } }],
    });
    if (sent.status !== "pending") throw new Error("expected a pending edit");
  }
  return { name: spec.name, model, base, moved };
}

function pushCase(fixture: PushFixture, label: string): Case {
  let flip = false;
  return {
    name: `snapshot push, one node changed (${label})`,
    metric: "pushMs",
    fixture: fixture.name,
    iterations: 50,
    fn: () => {
      flip = !flip;
      const result = fixture.model.pushSnapshot(
        flip ? fixture.moved : fixture.base,
      );
      if (result.status !== "applied" || result.operations !== 1)
        throw new Error(`push did not apply one change: ${result.status}`);
    },
  };
}

test("snapshot push into the snapshot adapter (headless)", async ({
  bench,
}) => {
  const cases: Case[] = [];
  for (const nodes of [500, 5000]) {
    cases.push(pushCase(pushFixture(nodes, false), "nothing pending"));
    cases.push(pushCase(pushFixture(nodes, true), "one pending edit"));
  }
  const rows = await runCases(bench, cases);
  saveResults("snapshot-push", rows);
}, 300_000);
