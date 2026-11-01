import { describe, expect, it } from "vitest";
import {
  type ConnectionPolicy,
  createDefaultConnectionPolicy,
  nodeId,
  portId,
} from "../../../core/index.js";
import {
  cornerNode,
  createToolHarness,
} from "../../test-support/tool-harness.js";

/** The default policy, but a connection into node `b` may be "fast" or "slow". */
function twoKindsIntoB(): ConnectionPolicy {
  const base = createDefaultConnectionPolicy();
  return {
    evaluate(proposal, graph) {
      const outcome = base.evaluate(proposal, graph);
      if (outcome.kind !== "accept" || proposal.to.node !== "b") return outcome;
      const kind = proposal.choice ?? proposal.kind;
      if (kind !== undefined) {
        return {
          kind: "accept",
          plan: { ...outcome.plan, connectionKind: kind },
        };
      }
      return {
        kind: "choice",
        alternatives: ["fast", "slow"].map((k) => ({
          ...outcome.plan,
          connectionKind: k,
          key: k,
        })),
      };
    },
  };
}

/** Port centers: a.R = (40, 10), b.L = (200, 10), c.L = (200, 100). */
const setup = (chooser: boolean) =>
  createToolHarness({
    chooser,
    modelOptions: { connectionPolicy: twoKindsIntoB() },
    nodes: [
      cornerNode("a", 0, 0),
      cornerNode("b", 200, 0),
      cornerNode("c", 200, 90),
    ],
  });

function drag(h: ReturnType<typeof setup>, to: { x: number; y: number }) {
  h.down({ x: 40, y: 10 });
  h.move({ x: 120, y: 40 });
  h.move(to);
  return h.up(to);
}

describe("connect evaluation of a policy choice", () => {
  it("a choice target has the choice state, its alternatives and a reason", () => {
    const h = setup(false);
    h.down({ x: 40, y: 10 });
    h.move({ x: 120, y: 40 });
    h.move({ x: 200, y: 10 });
    const preview = h.log.previews.at(-1);
    const c = preview?.kind === "connect" ? preview.candidates[0] : undefined;
    expect(c?.evaluation.state).toBe("choice");
    expect(c?.evaluation.reason).toBeDefined();
    expect(c?.evaluation.alternatives?.map((a) => a.key)).toEqual([
      "fast",
      "slow",
    ]);
    // The path snaps to the choice target, as to a compatible one.
    expect(preview?.kind === "connect" && preview.target).toEqual({
      node: nodeId("b"),
      port: portId("bL"),
    });
  });
});

describe("release on a choice target", () => {
  it("Policy offers two connection kinds: one choose effect, no commit, preview kept", () => {
    const h = setup(true);
    drag(h, { x: 200, y: 10 });
    expect(h.log.commits).toEqual([]);
    expect(h.log.chooses).toHaveLength(1);
    const request = h.log.chooses[0];
    expect(request?.source).toEqual({ node: nodeId("a"), port: portId("aR") });
    expect(request?.target).toEqual({ node: nodeId("b"), port: portId("bL") });
    expect(request?.alternatives.map((a) => a.key)).toEqual(["fast", "slow"]);
    expect(request?.at).toEqual({ x: 200, y: 10 });
    expect(h.log.previews.at(-1)?.kind).toBe("connect");
    expect(h.router.activeTool).toBeUndefined();
  });

  it("No chooser and a policy choice: nothing is committed, the preview clears", () => {
    const h = setup(false);
    drag(h, { x: 200, y: 10 });
    expect(h.log.commits).toEqual([]);
    expect(h.log.chooses).toEqual([]);
    expect(h.log.previews.at(-1)).toBeNull();
  });

  it("Single valid target does not ask: a direct accept commits with a chooser", () => {
    const h = setup(true);
    drag(h, { x: 200, y: 100 });
    expect(h.log.chooses).toEqual([]);
    expect(h.log.commits).toEqual([
      {
        kind: "connect",
        from: { node: nodeId("a"), port: portId("aR") },
        to: { node: nodeId("c"), port: portId("cL") },
      },
    ]);
  });

  it("No chooser and a direct accept commits as before", () => {
    const h = setup(false);
    drag(h, { x: 200, y: 100 });
    expect(h.log.commits).toHaveLength(1);
    expect(h.model.reader.connections()).toHaveLength(1);
  });

  it("Overlapping ports are not a choice: the first in the existing order wins", () => {
    // d sits exactly on c, so cL and dL share the release point.
    const h = createToolHarness({
      chooser: true,
      nodes: [
        cornerNode("a", 0, 0),
        cornerNode("c", 200, 90),
        cornerNode("d", 200, 90),
      ],
    });
    h.down({ x: 40, y: 10 });
    h.move({ x: 120, y: 40 });
    h.move({ x: 200, y: 100 });
    const preview = h.log.previews.at(-1);
    const first =
      preview?.kind === "connect" ? preview.candidates[0]?.endpoint : undefined;
    expect(preview?.kind === "connect" && preview.candidates).toHaveLength(2);
    h.up({ x: 200, y: 100 });
    expect(h.log.chooses).toEqual([]);
    expect(h.log.commits).toHaveLength(1);
    expect(h.log.commits[0]).toMatchObject({ kind: "connect", to: first });
  });
});
