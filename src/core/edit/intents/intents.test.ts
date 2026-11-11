import { describe, expect, it } from "vitest";
import type { GraphModel } from "../../graph-model.js";
import { end, firstConnection, make } from "../commands/test-kit.js";
import type { Command } from "../commands/types.js";
import { decodeIntents } from "./decode.js";
import {
  claimedKeys,
  intentModel,
  opKeys,
  randomCommand,
  rng,
  submissionFor,
  submissionOf,
} from "./test-kit.js";

const decode = (model: GraphModel, command: Command) =>
  decodeIntents(submissionOf(model, command), model.reader);

describe("submission intent decoding: one committed edit per gesture, one history entry per gesture", () => {
  it("decodes a three-node move as one move intent with old and new positions", () => {
    const model = intentModel();
    const a = make(model, "tank", 0, 0);
    const b = make(model, "tank", 100, 0);
    const c = make(model, "tank", 200, 0);
    const intents = decode(model, {
      kind: "moveNodes",
      moves: [a, b, c].map((m, i) => ({
        node: m.node,
        position: { x: i * 100 + 5, y: 7 },
      })),
    });
    expect(intents).toEqual([
      {
        kind: "move",
        nodes: [a, b, c].map((m, i) => ({
          node: m.node,
          old: { x: i * 100, y: 0 },
          new: { x: i * 100 + 5, y: 7 },
        })),
        routes: [],
      },
    ]);
  });

  it("folds the pinned route updates of a move into the move intent", () => {
    const model = intentModel();
    const a = make(model, "tank", 0, 0);
    const b = make(model, "tank", 100, 0);
    model.connect(end(a, 1), end(b, 0));
    const connection = firstConnection(model);
    const route = [
      { kind: "segment", orientation: "vertical", at: 50 },
    ] as const;
    expect(model.execute({ kind: "setRoute", connection, route }).status).toBe(
      "accepted",
    );
    const intents = decode(model, {
      kind: "moveNodes",
      moves: [
        { node: a.node, position: { x: 10, y: 0 } },
        { node: b.node, position: { x: 110, y: 0 } },
      ],
    });
    expect(intents.map((i) => i.kind)).toEqual(["move"]);
    const [moveIntent] = intents;
    expect(moveIntent?.kind === "move" && moveIntent.routes).toEqual([
      {
        connection,
        old: route,
        new: [{ kind: "segment", orientation: "vertical", at: 60 }],
      },
    ]);
  });

  it("decodes a resize that also moves the node as one resize carrying the position", () => {
    const model = intentModel();
    const a = make(model, "tank", 0, 0);
    const intents = decode(model, {
      kind: "resizeNode",
      node: a.node,
      size: { width: 60, height: 20 },
      fixed: { x: -1, y: 0 },
    });
    expect(intents).toEqual([
      {
        kind: "resize",
        nodes: [
          {
            node: a.node,
            old: { width: 40, height: 20 },
            new: { width: 60, height: 20 },
            position: { old: { x: 0, y: 0 }, new: { x: 10, y: 0 } },
          },
        ],
      },
    ]);
  });

  it("decodes a mirror that also changes rotation as one mirror carrying the rotation", () => {
    const model = intentModel();
    const a = make(model, "tank", 0, 0);
    model.rotateNodes([a.node], 1);
    const intents = decode(model, { kind: "mirrorNodes", nodes: [a.node] });
    expect(intents).toEqual([
      {
        kind: "mirror",
        nodes: [
          {
            node: a.node,
            old: false,
            new: true,
            rotation: { old: 1, new: 3 },
          },
        ],
      },
    ]);
  });

  it("decodes a node delete as one delete carrying its ports and connections", () => {
    const model = intentModel();
    const a = make(model, "tank", 0, 0);
    const b = make(model, "tank", 100, 0);
    const c = make(model, "tank", 200, 0);
    model.connect(end(a, 1), end(b, 0));
    model.connect(end(b, 1), end(c, 0));
    const intents = decode(model, { kind: "deleteEntities", nodes: [b.node] });
    expect(intents).toHaveLength(1);
    const [del] = intents;
    expect(del?.kind).toBe("delete");
    if (del?.kind !== "delete") return;
    expect(del.nodes.map((n) => n.id)).toEqual([b.node]);
    expect(del.ports.map((p) => p.id)).toEqual(b.ports);
    expect(del.connections.map((x) => x.id)).toEqual(
      model.reader.connections().map((x) => x.id),
    );
  });

  it("decodes a connection update of its endpoints as a reconnect of the same connection", () => {
    const model = intentModel();
    const a = make(model, "tank", 0, 0);
    const b = make(model, "tank", 100, 0);
    model.connect(end(a, 1), end(b, 0));
    const connection = firstConnection(model);
    const intents = decode(model, {
      kind: "reconnect",
      connection,
      end: "to",
      target: end(b, 1),
    });
    expect(intents).toEqual([
      {
        kind: "reconnect",
        connection,
        to: { old: end(b, 0), new: end(b, 1) },
      },
    ]);
  });

  it("decodes a created node with its ports as one create-node intent", () => {
    const model = intentModel();
    const sub = submissionOf(model, {
      kind: "createNode",
      type: "tank",
      position: { x: 3, y: 4 },
    });
    const intents = decodeIntents(sub, model.reader);
    expect(intents).toHaveLength(1);
    const [created] = intents;
    expect(created?.kind).toBe("create-node");
    if (created?.kind !== "create-node") return;
    expect(created.node.position).toEqual({ x: 3, y: 4 });
    expect(created.ports).toHaveLength(2);
    expect(created.ports.every((p) => p.node === created.node.id)).toBe(true);
  });

  it("gives rotate and mirror as absolute values with old and new", () => {
    const model = intentModel();
    const a = make(model, "tank", 0, 0);
    const intents = decodeIntents(
      submissionFor(model, {
        ops: [
          {
            op: "update",
            entity: "node",
            id: a.node,
            fields: { rotation: { old: 1, new: 3 } },
          },
        ],
      }),
      model.reader,
    );
    expect(intents).toEqual([
      { kind: "rotate", nodes: [{ node: a.node, old: 1, new: 3 }] },
    ]);
    const mirrored = decode(model, {
      kind: "mirrorNodes",
      nodes: [a.node],
      axis: "vertical",
    });
    expect(mirrored).toEqual([
      {
        kind: "mirror",
        nodes: [
          {
            node: a.node,
            old: false,
            new: true,
            rotation: { old: 0, new: 2 },
          },
        ],
      },
    ]);
  });

  it("decodes a connection remove plus an unrelated add as a disconnect and a connect, not a reconnect", () => {
    const model = intentModel();
    const a = make(model, "tank", 0, 0);
    const b = make(model, "tank", 100, 0);
    model.connect(end(a, 1), end(b, 0));
    const old = model.reader.connections()[0];
    if (!old) throw new Error("no connection");
    const added = { ...old, id: "c9" as typeof old.id, to: end(b, 1) };
    const intents = decodeIntents(
      submissionFor(model, {
        ops: [
          {
            op: "remove",
            entity: "connection",
            record: old,
            seq: model.reader.seqOf(old.id) ?? 0,
          },
          { op: "add", entity: "connection", record: added },
        ],
      }),
      model.reader,
    );
    expect(intents).toEqual([
      { kind: "disconnect", connection: old },
      { kind: "connect", connection: added },
    ]);
  });

  it("collects operations it has no name for in one catch-all intent", () => {
    const model = intentModel();
    const a = make(model, "tank", 0, 0);
    const sub = submissionOf(model, {
      kind: "updateNode",
      node: a.node,
      title: "Renamed",
    });
    expect(decodeIntents(sub, model.reader)).toEqual([
      { kind: "other", ops: sub.patch.ops },
    ]);
  });
});

describe("submission intent decoding property", () => {
  it("claims every operation of random real-command patches by exactly one intent (seeded)", () => {
    const next = rng(20261111);
    const model = intentModel();
    const seen = new Set<string>();
    let checked = 0;
    for (let step = 0; step < 600; step += 1) {
      const planned = model.plan(randomCommand(model, next));
      if (planned.kind !== "ready" || planned.patch.ops.length === 0) continue;
      const sub = submissionFor(model, planned.patch, planned.label);
      const intents = decodeIntents(sub, model.reader);
      expect(claimedKeys(intents), `step ${step}`).toEqual(opKeys(sub.patch));
      for (const intent of intents) seen.add(intent.kind);
      checked += 1;
      expect(model.submit(planned.patch).status).toBe("accepted");
    }
    expect(checked).toBeGreaterThan(200);
    expect([...seen].sort()).toEqual([
      "connect",
      "create-node",
      "delete",
      "disconnect",
      "mirror",
      "move",
      "other",
      "reconnect",
      "resize",
      "rotate",
    ]);
  });
});
