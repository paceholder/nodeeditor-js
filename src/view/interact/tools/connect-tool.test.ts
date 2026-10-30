import { describe, expect, it } from "vitest";
import { mkNode, mkPort } from "../../../core/data/model/test-helpers.js";
import {
  createGraphModel,
  type GraphModel,
  nodeId,
  portId,
} from "../../../core/index.js";
import { graphOps } from "../../../core/space/scene/scene-fixtures.js";
import {
  cornerNode,
  createToolHarness,
} from "../../test-support/tool-harness.js";
import { nodeKey } from "../selection/selection-model.js";
import { createToolContext } from "./tool-context.js";
import type { ToolPreview } from "./tool-types.js";

const lastConnect = (
  previews: Array<ToolPreview | null>,
): Extract<ToolPreview, { kind: "connect" }> | undefined => {
  const p = [...previews].reverse().find((x) => x?.kind === "connect");
  return p?.kind === "connect" ? p : undefined;
};

/** Port centers: a.R = (40, 10), b.L = (200, 10), c.L = (200, 100). */
const pair = () =>
  createToolHarness({
    nodes: [
      cornerNode("a", 0, 0),
      cornerNode("b", 200, 0),
      cornerNode("c", 200, 90),
    ],
  });

describe("connect tool", () => {
  it("a drag from a port to a compatible port submits exactly one connect command", () => {
    const h = pair();
    h.down({ x: 40, y: 10 });
    expect(h.router.activeTool).toBe("connect");
    for (let x = 50; x <= 200; x += 10) h.move({ x, y: 10 });
    h.up({ x: 200, y: 10 });
    expect(h.log.commits).toHaveLength(1);
    expect(h.log.commits[0]).toMatchObject({ kind: "connect" });
    expect(h.model.reader.connections()).toHaveLength(1);
    expect(h.router.activeTool).toBeUndefined();
    expect(h.log.previews.at(-1)).toBeNull();
    // One gesture, one history entry.
    expect(h.model.historyState().undoLabel).toBe("Connect");
    expect(h.model.undo().status).toBe("accepted");
    expect(h.model.reader.connections()).toHaveLength(0);
    expect(h.model.historyState().undoLabel).not.toBe("Connect");
  });

  it("a release on empty canvas submits nothing", () => {
    const h = pair();
    h.down({ x: 40, y: 10 });
    h.move({ x: 100, y: 60 });
    h.up({ x: 100, y: 60 });
    expect(h.log.commits).toEqual([]);
    expect(h.model.reader.connections()).toHaveLength(0);
    expect(h.router.activeTool).toBeUndefined();
  });

  it("a release on an incompatible port submits nothing and shows the reason", () => {
    const h = pair();
    // Its own node's other port: the default policy refuses a self-loop.
    h.down({ x: 40, y: 10 });
    h.move({ x: 20, y: 40 });
    h.move({ x: 0, y: 10 });
    const preview = lastConnect(h.log.previews);
    expect(preview?.candidates[0]?.evaluation.state).toBe("incompatible");
    expect(preview?.candidates[0]?.evaluation.reason).toMatch(
      /cannot be joined/,
    );
    expect(preview?.target).toBeUndefined();
    expect(h.log.cursors.at(-1)).toBe("not-allowed");
    h.up({ x: 0, y: 10 });
    expect(h.log.commits).toEqual([]);
  });

  it("the path snaps to the nearest compatible port and ties keep pick order", () => {
    const h = pair();
    h.down({ x: 40, y: 10 });
    h.move({ x: 150, y: 20 });
    h.move({ x: 198, y: 14 });
    const preview = lastConnect(h.log.previews);
    expect(preview?.target).toEqual({
      node: nodeId("b"),
      port: portId("bL"),
    });
  });

  it("a click on a port without a drag selects its node and commits nothing", () => {
    const h = pair();
    h.down({ x: 40, y: 10 });
    h.move({ x: 41, y: 10 });
    h.up({ x: 41, y: 10 });
    expect(h.selection.keys()).toEqual([nodeKey(nodeId("a"))]);
    expect(h.log.commits).toEqual([]);
    expect(h.log.previews).toEqual([]);
  });

  it("Escape cancels the gesture and submits nothing", () => {
    const h = pair();
    h.down({ x: 40, y: 10 });
    h.move({ x: 120, y: 10 });
    h.key("Escape");
    expect(h.router.activeTool).toBeUndefined();
    h.up({ x: 200, y: 10 });
    expect(h.log.commits).toEqual([]);
    expect(h.log.previews.at(-1)).toBeNull();
  });

  it("the gesture cancels when its source node is removed", () => {
    const h = pair();
    h.down({ x: 40, y: 10 });
    h.move({ x: 120, y: 10 });
    h.model.execute({ kind: "deleteEntities", nodes: [nodeId("a")] });
    h.send({ type: "entities-removed", ids: ["a", "aL", "aR"] });
    expect(h.router.activeTool).toBeUndefined();
    h.up({ x: 200, y: 10 });
    expect(h.log.commits).toEqual([]);
    expect(h.model.reader.connections()).toHaveLength(0);
  });

  it("unrelated removals do not cancel the gesture", () => {
    const h = pair();
    h.down({ x: 40, y: 10 });
    h.move({ x: 120, y: 10 });
    h.send({ type: "entities-removed", ids: ["c"] });
    expect(h.router.activeTool).toBe("connect");
  });
});

function typedModel(): GraphModel {
  const model = createGraphModel();
  const node = (
    id: string,
    x: number,
    y: number,
    ports: ReturnType<typeof mkPort>[],
  ) => [
    {
      op: "add" as const,
      entity: "node" as const,
      record: mkNode(id, {
        position: { x, y },
        size: { width: 40, height: 20 },
        ports: ports.map((p) => p.id),
      }),
    },
    ...ports.map((p) => ({
      op: "add" as const,
      entity: "port" as const,
      record: p,
    })),
  ];
  const left = { placement: { x: 0, y: 0.5 } };
  const right = { placement: { x: 1, y: 0.5 } };
  const r = model.submit({
    ops: [
      ...node("a", 20, 10, [mkPort("aR", "a", { ...right, typeKey: "pipe" })]),
      ...node("b", 220, 10, [
        mkPort("bL", "b", { ...left, typeKey: "signal" }),
      ]),
      ...node("c", 220, 90, [mkPort("cL", "c", { ...left, typeKey: "pipe" })]),
      ...node("d", 420, 10, [
        mkPort("dL", "d", { ...left, typeKey: "pipe", limit: 1 }),
      ]),
    ],
  });
  if (r.status !== "accepted") throw new Error("fixture rejected");
  return model;
}

describe("connect tool: candidate states", () => {
  it("a type mismatch is incompatible and carries the policy's reason", () => {
    const model = typedModel();
    const ctx = createToolContext({
      reader: model.reader,
      scene: createToolHarness({ model }).scene,
      selection: createToolHarness({ model }).selection,
      viewport: () => ({ zoom: 1, panX: 0, panY: 0 }),
      can: () => ({ available: true }),
      plan: model.plan,
    })();
    const e = ctx.evaluateConnection(
      { node: nodeId("a"), port: portId("aR") },
      { node: nodeId("b"), port: portId("bL") },
    );
    expect(e.state).toBe("incompatible");
    expect(e.code).toBe("type-mismatch");
    expect(e.reason).toContain("pipe");
  });

  it("an occupied port with an unlimited limit is compatible with an occupied mark", () => {
    const model = typedModel();
    model.connect(
      { node: nodeId("a"), port: portId("aR") },
      { node: nodeId("c"), port: portId("cL") },
    );
    const h = createToolHarness({ model });
    h.down({ x: 400, y: 10 });
    h.move({ x: 300, y: 50 });
    h.move({ x: 200, y: 90 });
    const candidate = lastConnect(h.log.previews)?.candidates[0];
    expect(candidate?.endpoint.port).toBe(portId("cL"));
    expect(candidate?.evaluation).toMatchObject({
      state: "compatible",
      occupiedMark: true,
    });
  });

  it("a port at its attachment limit is occupied", () => {
    const model = typedModel();
    const first = model.connect(
      { node: nodeId("c"), port: portId("cL") },
      { node: nodeId("d"), port: portId("dL") },
    );
    expect(first.status).toBe("accepted");
    const h = createToolHarness({ model });
    const ctx = createToolContext({
      reader: model.reader,
      scene: h.scene,
      selection: h.selection,
      viewport: () => h.viewport(),
      can: () => ({ available: true }),
      plan: model.plan,
    })();
    const e = ctx.evaluateConnection(
      { node: nodeId("a"), port: portId("aR") },
      { node: nodeId("d"), port: portId("dL") },
    );
    expect(e.state).toBe("occupied");
    expect(e.code).toBe("capacity-exhausted");
  });

  it("a capability denial is unavailable", () => {
    const model = createGraphModel({
      capabilityPolicy: {
        decide: (action) => (action === "connect" ? false : undefined),
      },
    });
    const ops = graphOps([cornerNode("a", 0, 0), cornerNode("b", 100, 0)]);
    expect(model.submit({ ops }).status).toBe("accepted");
    const h = createToolHarness({ model });
    const ctx = createToolContext({
      reader: model.reader,
      scene: h.scene,
      selection: h.selection,
      viewport: () => h.viewport(),
      can: () => ({ available: true }),
      plan: model.plan,
    })();
    const e = ctx.evaluateConnection(
      { node: nodeId("a"), port: portId("aR") },
      { node: nodeId("b"), port: portId("bL") },
    );
    expect(e.state).toBe("unavailable");
  });

  it("evaluations are cached per revision and recomputed after a change", () => {
    const h = pair();
    let calls = 0;
    const ctx = createToolContext({
      reader: h.model.reader,
      scene: h.scene,
      selection: h.selection,
      viewport: () => h.viewport(),
      can: () => ({ available: true }),
      plan: (c) => {
        calls++;
        return h.model.plan(c);
      },
    });
    const from = { node: nodeId("a"), port: portId("aR") };
    const to = { node: nodeId("b"), port: portId("bL") };
    ctx().evaluateConnection(from, to);
    ctx().evaluateConnection(from, to);
    expect(calls).toBe(1);
    h.model.execute({ kind: "connect", from, to });
    expect(ctx().evaluateConnection(from, to).state).toBe("incompatible");
    expect(calls).toBe(2);
  });
});
