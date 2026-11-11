import { describe, expect, it } from "vitest";
import { mkNode, mkPort } from "../../../core/data/model/test-helpers.js";
import {
  type ConnectionValidator,
  type ConnectionVerdict,
  createGraphModel,
  type GraphModel,
  nodeId,
  portId,
  rejectionOf,
  type VerdictRequest,
} from "../../../core/index.js";
import { graphOps } from "../../../core/space/scene/scene-fixtures.js";
import {
  createSnapshotToolHarness,
  recordOf,
} from "../../test-support/snapshot-tool-harness.js";
import {
  cornerNode,
  createToolHarness,
} from "../../test-support/tool-harness.js";
import { nodeKey } from "../selection/selection-model.js";
import { connectTool } from "./connect-tool.js";
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
    expect(h.router.activeTool).toBeUndefined();
    expect(h.cancellations).toEqual([
      { reason: "entity-removed", ids: ["a", "aR"] },
    ]);
    h.up({ x: 200, y: 10 });
    expect(h.log.commits).toEqual([]);
    expect(h.model.reader.connections()).toHaveLength(0);
  });

  it("a running gesture involves its source node and port", () => {
    const source = { node: nodeId("a"), port: portId("aR") };
    expect(connectTool.involved?.({ kind: "idle" })).toEqual([]);
    expect(
      connectTool.involved?.({
        kind: "dragging",
        pointerId: 1,
        source,
        at: { x: 0, y: 0 },
        asked: undefined,
      }),
    ).toEqual(["a", "aR"]);
  });

  it("unrelated removals do not cancel the gesture", () => {
    const h = pair();
    h.down({ x: 40, y: 10 });
    h.move({ x: 120, y: 10 });
    h.model.execute({ kind: "deleteEntities", nodes: [nodeId("c")] });
    expect(h.router.activeTool).toBe("connect");
    expect(h.cancellations).toEqual([]);
  });
});

describe("connect tool: changes to involved entities from a host-owned document", () => {
  /** Port centers as in `pair`: a.R = (40, 10), b.L = (200, 10). */
  const hosted = () =>
    createSnapshotToolHarness({
      nodes: [
        cornerNode("a", 0, 0),
        cornerNode("b", 200, 0),
        cornerNode("c", 200, 90),
      ],
    });

  it("a push removing the source node cancels with entity-removed and submits nothing", () => {
    const h = hosted();
    h.down({ x: 40, y: 10 });
    h.move({ x: 120, y: 10 });
    h.push((s) => {
      s.nodes = s.nodes.filter((n) => n.id !== "a");
    });
    expect(h.cancellations).toEqual([
      { reason: "entity-removed", ids: ["a", "aR"] },
    ]);
    h.up({ x: 200, y: 10 });
    expect(h.host.calls).toEqual([]);
  });

  it("a push changing the source node cancels with external-change", () => {
    const h = hosted();
    h.down({ x: 40, y: 10 });
    h.move({ x: 120, y: 10 });
    h.push((s) => {
      recordOf(s.nodes, "a").title = "Renamed";
    });
    expect(h.cancellations).toEqual([
      { reason: "external-change", ids: ["a"] },
    ]);
    h.up({ x: 200, y: 10 });
    expect(h.host.calls).toEqual([]);
  });

  it("a rollback after the host rejects an edit of the source node cancels with external-change", async () => {
    const h = hosted();
    h.model.execute({
      kind: "moveNodes",
      moves: [{ node: nodeId("a"), position: { x: 20, y: 50 } }],
    });
    h.down({ x: 40, y: 50 });
    h.move({ x: 120, y: 30 });
    expect(h.router.activeTool).toBe("connect");
    await h.answer(0, "rejected");
    expect(h.cancellations).toEqual([
      { reason: "external-change", ids: ["a"] },
    ]);
    h.up({ x: 200, y: 10 });
    expect(h.host.calls).toHaveLength(1);
  });

  it("an unrelated push does not cancel; the release submits one connect", () => {
    const h = hosted();
    h.down({ x: 40, y: 10 });
    h.move({ x: 120, y: 10 });
    h.push((s) => {
      recordOf(s.nodes, "c").title = "Renamed";
    });
    h.up({ x: 200, y: 10 });
    expect(h.cancellations).toEqual([]);
    expect(h.log.commits).toEqual([
      expect.objectContaining({ kind: "connect" }),
    ]);
    expect(h.host.calls).toHaveLength(1);
    expect(h.model.reader.connections()).toHaveLength(1);
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

describe("ports hidden when zoomed out", () => {
  const harness = (hidePortsBelow: number) =>
    createToolHarness({
      nodes: [cornerNode("a", 0, 0), cornerNode("b", 200, 0)],
      viewport: { zoom: 0.1, panX: 0, panY: 0 },
      hidePortsBelow,
    });

  it("a press on a hidden port anchor selects and moves the node, never connects", () => {
    const h = harness(0.25);
    // a.R sits at (40, 10); just inside the body.
    h.down({ x: 39, y: 10 });
    expect(h.router.activeTool).toBe("select-move");
    h.move({ x: 200, y: 200 });
    h.up({ x: 200, y: 200 });
    expect(h.log.commits.map((c) => c.kind)).toEqual(["moveNodes"]);
    expect(h.model.reader.connections()).toHaveLength(0);
  });

  it("a press beside a hidden port on empty canvas pans", () => {
    const h = harness(0.25);
    // Outside the body, inside the 8 px capture radius (80 world units at zoom 0.1).
    h.down({ x: 60, y: 10 });
    expect(h.router.activeTool).toBe("empty-pan");
    h.up({ x: 60, y: 10 });
  });

  it("a threshold of 0 keeps ports at every zoom", () => {
    const h = harness(0);
    h.down({ x: 60, y: 10 });
    expect(h.router.activeTool).toBe("connect");
  });
});

/** A validator the test answers by hand, one call at a time. */
function slowValidator() {
  const calls: Array<
    VerdictRequest & {
      answer(verdict: ConnectionVerdict): Promise<void>;
      fail(error: Error): Promise<void>;
    }
  > = [];
  const settle = () => new Promise((r) => setTimeout(r, 0));
  const validator: ConnectionValidator = (request) =>
    new Promise((resolve, reject) => {
      calls.push({
        ...request,
        answer: async (verdict) => {
          resolve(verdict);
          await settle();
        },
        fail: async (error) => {
          reject(error);
          await settle();
        },
      });
    });
  return { validator, calls };
}

const validated = () => {
  const { validator, calls } = slowValidator();
  const h = createToolHarness({
    modelOptions: { connectionValidator: validator },
    nodes: [
      cornerNode("a", 0, 0),
      cornerNode("b", 200, 0),
      cornerNode("c", 200, 90),
    ],
  });
  return { h, calls };
};

describe("connect tool waits for a host verdict", () => {
  it("a pending target is shown during the drag, asked about once, and turns compatible when the verdict arrives", async () => {
    const { h, calls } = validated();
    h.down({ x: 40, y: 10 });
    for (let x = 60; x <= 200; x += 20) h.move({ x, y: 10 });
    let preview = lastConnect(h.log.previews);
    expect(preview?.candidates[0]?.evaluation.state).toBe("pending");
    expect(preview?.target).toEqual({ node: nodeId("b"), port: portId("bL") });
    expect(h.log.cursors.at(-1)).toBe("crosshair");
    expect(calls).toHaveLength(1);
    expect(calls[0]?.proposal.to.port).toBe("bL");

    await calls[0]?.answer({ valid: true });
    // No pointer movement: the verdict itself refreshes the preview.
    preview = lastConnect(h.log.previews);
    expect(preview?.candidates[0]?.evaluation.state).toBe("compatible");
    expect(calls).toHaveLength(1);
    expect(h.log.commits).toEqual([]);
  });

  it("a change that drops the verdict of the hovered target makes it pending and asked about again", async () => {
    const { h, calls } = validated();
    h.down({ x: 40, y: 10 });
    h.move({ x: 120, y: 10 });
    h.move({ x: 200, y: 10 });
    await calls[0]?.answer({ valid: true });
    expect(lastConnect(h.log.previews)?.candidates[0]?.evaluation.state).toBe(
      "compatible",
    );
    expect(calls).toHaveLength(1);
    h.model.execute({
      kind: "moveNodes",
      moves: [{ node: nodeId("b"), position: { x: 224, y: 10 } }],
    });
    expect(calls).toHaveLength(2);
    expect(lastConnect(h.log.previews)?.candidates[0]?.evaluation.state).toBe(
      "pending",
    );
    await calls[1]?.answer({ valid: true });
    expect(lastConnect(h.log.previews)?.candidates[0]?.evaluation.state).toBe(
      "compatible",
    );
    h.send({ type: "cancel", reason: "escape" });
  });

  it("a verdict discarded as stale is not asked for again when the target port is gone", async () => {
    const { h, calls } = validated();
    h.down({ x: 40, y: 10 });
    h.move({ x: 120, y: 10 });
    h.move({ x: 200, y: 10 });
    expect(calls).toHaveLength(1);
    h.model.execute({ kind: "deleteEntities", nodes: [nodeId("b")] });
    await calls[0]?.answer({ valid: true });
    expect(calls).toHaveLength(1);
    expect(h.model.reader.connections()).toHaveLength(0);
    h.send({ type: "cancel", reason: "escape" });
  });

  it("release on a pending target waits with the preview kept, then one connect on an accepted verdict", async () => {
    const { h, calls } = validated();
    h.down({ x: 40, y: 10 });
    h.move({ x: 120, y: 10 });
    h.move({ x: 200, y: 10 });
    h.up({ x: 200, y: 10 });
    expect(h.router.activeTool).toBe("connect");
    expect(h.router.activePointer).toBeUndefined();
    expect(h.log.releases).toEqual([1]);
    expect(h.log.commits).toEqual([]);
    expect(h.log.previews.at(-1)?.kind).toBe("connect");
    expect(h.log.cursors.at(-1)).toBe("default");

    await calls[0]?.answer({ valid: true });
    expect(h.router.activeTool).toBeUndefined();
    expect(h.log.commits.map((c) => c.kind)).toEqual(["connect"]);
    expect(h.log.submits[0]?.status).toBe("accepted");
    expect(h.model.reader.connections()).toHaveLength(1);
    expect(h.log.previews.at(-1)).toBeNull();
    expect(h.model.historyState().undoLabel).toBeDefined();
  });

  it("a rejected verdict after the release commits nothing, clears the preview and reports the reason", async () => {
    const { h, calls } = validated();
    h.down({ x: 40, y: 10 });
    h.move({ x: 200, y: 10 });
    h.up({ x: 200, y: 10 });
    const reason = rejectionOf("type-mismatch", "Not on this host", [
      "aR",
      "bL",
    ]);
    await calls[0]?.answer({ valid: false, rejection: reason });
    expect(h.router.activeTool).toBeUndefined();
    expect(h.log.commits).toEqual([]);
    expect(h.log.previews.at(-1)).toBeNull();
    expect(h.log.rejections).toEqual([
      expect.objectContaining({
        code: "type-mismatch",
        message: "Not on this host",
      }),
    ]);
    expect(h.model.reader.connections()).toHaveLength(0);
  });

  it("Escape while waiting aborts the request and ignores a later verdict", async () => {
    const { h, calls } = validated();
    h.down({ x: 40, y: 10 });
    h.move({ x: 200, y: 10 });
    h.up({ x: 200, y: 10 });
    expect(calls[0]?.signal.aborted).toBe(false);
    h.key("Escape");
    expect(h.router.activeTool).toBeUndefined();
    expect(h.log.previews.at(-1)).toBeNull();
    expect(calls[0]?.signal.aborted).toBe(true);
    await calls[0]?.answer({ valid: true });
    expect(h.log.commits).toEqual([]);
    expect(h.model.reader.connections()).toHaveLength(0);
  });

  it("dispose cancels the wait like any other gesture", async () => {
    const { h, calls } = validated();
    h.down({ x: 40, y: 10 });
    h.move({ x: 200, y: 10 });
    h.up({ x: 200, y: 10 });
    h.send({ type: "cancel", reason: "dispose" });
    expect(h.router.activeTool).toBeUndefined();
    expect(calls[0]?.signal.aborted).toBe(true);
    await calls[0]?.answer({ valid: true });
    expect(h.log.commits).toEqual([]);
  });

  it("a new press while waiting cancels the wait and starts a new connect gesture", async () => {
    const { h, calls } = validated();
    h.down({ x: 40, y: 10 });
    h.move({ x: 200, y: 10 });
    h.up({ x: 200, y: 10 });
    expect(h.router.activePointer).toBeUndefined();
    // c's left port.
    h.down({ x: 200, y: 100 });
    expect(h.router.activeTool).toBe("connect");
    expect(h.router.activePointer).toBe(1);
    expect(h.log.captures).toEqual([1, 1]);
    await calls[0]?.answer({ valid: true });
    expect(h.log.commits).toEqual([]);
    expect(h.model.reader.connections()).toHaveLength(0);
    h.send({ type: "cancel", reason: "escape" });
  });

  it("a wait has no pointer: blur, a hidden tab and a lost capture do not end it", async () => {
    const { h, calls } = validated();
    h.down({ x: 40, y: 10 });
    h.move({ x: 200, y: 10 });
    h.up({ x: 200, y: 10 });
    for (const reason of [
      "blur",
      "hidden",
      "lost-capture",
      "pointercancel",
    ] as const) {
      h.send({ type: "cancel", reason });
      expect(h.router.activeTool).toBe("connect");
    }
    expect(calls[0]?.signal.aborted).toBe(false);
    await calls[0]?.answer({ valid: true });
    expect(h.log.commits.map((c) => c.kind)).toEqual(["connect"]);
  });

  it("removing the target while waiting cancels the wait and aborts the request", async () => {
    const { h, calls } = validated();
    h.down({ x: 40, y: 10 });
    h.move({ x: 200, y: 10 });
    h.up({ x: 200, y: 10 });
    h.model.execute({ kind: "deleteEntities", nodes: [nodeId("b")] });
    expect(h.router.activeTool).toBeUndefined();
    expect(h.cancellations[0]?.reason).toBe("entity-removed");
    expect(h.cancellations[0]?.ids).toEqual(["b", "bL"]);
    expect(calls[0]?.signal.aborted).toBe(true);
    await calls[0]?.answer({ valid: true });
    expect(h.log.commits).toEqual([]);
  });

  it("a release over a port the policy refuses reports the reason and commits nothing", () => {
    const h = pair();
    h.down({ x: 40, y: 10 });
    h.move({ x: 20, y: 40 });
    h.move({ x: 0, y: 10 });
    h.up({ x: 0, y: 10 });
    expect(h.log.commits).toEqual([]);
    expect(h.log.rejections.map((r) => r.code)).toEqual(["self-loop"]);
    expect(h.log.rejections[0]?.entities).toEqual(["aR", "aL"]);
  });

  it("without a validator a pending target is not waited for", () => {
    const h = createToolHarness({
      modelOptions: {
        connectionPolicy: {
          evaluate: () => ({ kind: "pending", reason: "elsewhere" }),
        },
      },
      nodes: [cornerNode("a", 0, 0), cornerNode("b", 200, 0)],
    });
    h.down({ x: 40, y: 10 });
    h.move({ x: 200, y: 10 });
    expect(lastConnect(h.log.previews)?.target).toBeUndefined();
    h.up({ x: 200, y: 10 });
    expect(h.router.activeTool).toBeUndefined();
    expect(h.log.commits).toEqual([]);
  });

  it("a failing validator refuses the pair while the gesture runs and is asked again by the next one", async () => {
    const { h, calls } = validated();
    h.down({ x: 40, y: 10 });
    h.move({ x: 120, y: 10 });
    h.move({ x: 200, y: 10 });
    await calls[0]?.fail(new Error("host down"));
    expect(lastConnect(h.log.previews)?.candidates[0]?.evaluation.code).toBe(
      "validator-failed",
    );
    h.up({ x: 200, y: 10 });
    expect(h.log.rejections.map((r) => r.code)).toEqual(["validator-failed"]);
    expect(h.log.commits).toEqual([]);

    // The failure does not outlive its gesture: the same pair is pending again.
    h.down({ x: 40, y: 10 });
    h.move({ x: 120, y: 10 });
    h.move({ x: 200, y: 10 });
    expect(calls).toHaveLength(2);
    expect(lastConnect(h.log.previews)?.candidates[0]?.evaluation.state).toBe(
      "pending",
    );
    h.send({ type: "cancel", reason: "escape" });
  });
});
