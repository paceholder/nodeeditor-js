import type {
  Endpoint,
  ExecuteResult,
  NodeId,
  SnapshotModel,
} from "@paceholder/nodeeditor-js";
import { afterEach, describe, expect, it } from "vitest";
import { type HostSession, openSession } from "./host.js";
import { createStore, type Store } from "./store.js";

const sessions: HostSession[] = [];
afterEach(() => {
  for (const s of sessions.splice(0)) s.dispose();
});

async function open(store: Store, clientId: string): Promise<HostSession> {
  const session = await openSession(store, { clientId });
  sessions.push(session);
  return session;
}

/** The answer of an edit that waits for the store. */
function settledOf(result: ExecuteResult) {
  if (result.status !== "pending" && result.status !== "queued")
    throw new Error(`expected a pending edit, got ${result.status}`);
  return result.settled;
}

async function created(
  model: SnapshotModel,
  type: string,
  x: number,
): Promise<NodeId> {
  const outcome = await settledOf(model.createNode(type, { x, y: 0 }));
  if (outcome.status !== "accepted" || !outcome.nodeId)
    throw new Error(`creation ${outcome.status}`);
  return outcome.nodeId;
}

const portOf = (model: SnapshotModel, node: NodeId): Endpoint => {
  const port = model.reader.portsOf(node)[0];
  if (!port) throw new Error(`no port on ${node}`);
  return { node, port: port.id };
};

/** A source and a sink created through the store, as every client sees them. */
async function sourceAndSink(model: SnapshotModel) {
  const source = await created(model, "source", 0);
  const sink = await created(model, "sink", 200);
  return { from: portOf(model, source), to: portOf(model, sink) };
}

describe("store-wrapping recipe: the example runs headless", () => {
  it("a node created through the editor is named by the store and arrives in a refresh", async () => {
    const store = createStore();
    const { model } = await open(store, "alice");
    const result = model.createNode("source", { x: 10, y: 20 });
    expect(result.status).toBe("pending");
    expect(model.reader.nodes()).toEqual([]);
    expect(model.placeholders()).toMatchObject([
      { type: "source", position: { x: 10, y: 20 } },
    ]);
    const outcome = await settledOf(result);
    expect(outcome).toMatchObject({ status: "accepted", nodeId: "node-1" });
    expect(model.reader.getNode("node-1" as NodeId)?.position).toEqual({
      x: 10,
      y: 20,
    });
    expect(model.reader.portsOf("node-1" as NodeId).map((p) => p.id)).toEqual([
      "node-1/out0",
    ]);
    expect(model.placeholders()).toEqual([]);
  });

  it("a connection shows at once, reaches the store as one call, settles, and a refresh then changes nothing", async () => {
    const store = createStore();
    const { model, refresh } = await open(store, "alice");
    const { from, to } = await sourceAndSink(model);
    const calls = store.received.length;

    const result = model.connect(from, to);
    // Optimistic: shown and flagged unconfirmed while the store has not answered.
    const [shown] = model.reader.connections();
    expect(shown?.id).toBe("alice.c1");
    expect(model.unconfirmed().connections.has(shown?.id as never)).toBe(true);
    expect(store.peek().links).toEqual([]);
    expect(store.received.slice(calls)).toEqual([
      [
        {
          op: "add-link",
          id: "alice.c1",
          a: { node: from.node, pin: from.port },
          b: { node: to.node, pin: to.port },
        },
      ],
    ]);

    expect(await settledOf(result)).toMatchObject({ status: "accepted" });
    expect(store.peek().links.map((l) => l.id)).toEqual(["alice.c1"]);
    expect(model.pendingEdits()).toEqual([]);
    expect(await refresh()).toMatchObject({ status: "applied", operations: 0 });
  });

  it("a move of two nodes is one submission, one store batch and one undo entry", async () => {
    const store = createStore();
    const { model, refresh } = await open(store, "alice");
    const { from, to } = await sourceAndSink(model);
    const calls = store.received.length;
    const result = model.moveNodes([
      { node: from.node, position: { x: 5, y: 50 } },
      { node: to.node, position: { x: 205, y: 50 } },
    ]);
    expect(model.reader.getNode(from.node)?.position).toEqual({ x: 5, y: 50 });
    expect(store.received.slice(calls)).toHaveLength(1);
    expect(await settledOf(result)).toMatchObject({ status: "accepted" });
    expect(store.peek().nodes.map((n) => [n.x, n.y])).toEqual([
      [5, 50],
      [205, 50],
    ]);
    expect(await refresh()).toMatchObject({ status: "applied", operations: 0 });
    expect(model.historyState()).toMatchObject({
      canUndo: true,
      undoLabel: "Move",
    });
  });

  it("an edit the store has no call for is refused and rolled back", async () => {
    const store = createStore();
    const { model } = await open(store, "alice");
    const node = await created(model, "relay", 0);
    const failures: string[] = [];
    model.on("failure", (e) => {
      if (e.source === "rejection") failures.push(e.rejection.code);
    });
    const result = model.rotateNodes([node], 1);
    expect(model.reader.getNode(node)?.rotation).toBe(1);
    expect(await settledOf(result)).toMatchObject({
      status: "rejected",
      rejection: {
        code: "unsupported-command",
        message: "This store cannot rotate nodes",
      },
    });
    expect(model.reader.getNode(node)?.rotation).toBe(0);
    expect(failures).toEqual(["unsupported-command"]);
  });
});

describe("external authority: the host keeps its own format", () => {
  it("the store holds only its two lists, never a library document", async () => {
    const store = createStore();
    const { model } = await open(store, "alice");
    const { from, to } = await sourceAndSink(model);
    await settledOf(model.connect(from, to));
    const doc = store.peek();
    expect(Object.keys(doc).sort()).toEqual(["links", "nodes", "version"]);
    expect(Object.keys(doc.nodes[0] ?? {}).sort()).toEqual([
      "id",
      "kind",
      "label",
      "pins",
      "x",
      "y",
    ]);
    expect(Object.keys(doc.links[0] ?? {}).sort()).toEqual(["a", "b", "id"]);
    expect(JSON.stringify(doc)).not.toContain("nodeeditor-js");
  });
});

describe("store-wrapping recipe: client-named connections on a shared store", () => {
  it("two clients issue different IDs, and the second link between the same pins is refused and rolled back", async () => {
    const store = createStore();
    const alice = await open(store, "alice");
    const bob = await open(store, "bob");
    const { from, to } = await sourceAndSink(alice.model);
    await bob.refresh();

    // Both connect the same pins before either sees the other's link.
    const first = alice.model.connect(from, to);
    const second = bob.model.connect(from, to);
    expect(bob.model.reader.connections().map((c) => c.id)).toEqual(["bob.c1"]);

    expect(await settledOf(first)).toMatchObject({ status: "accepted" });
    expect(await settledOf(second)).toMatchObject({
      status: "rejected",
      rejection: { code: "duplicate-connection" },
    });
    await bob.refresh();
    expect(bob.model.reader.connections().map((c) => c.id)).toEqual([
      "alice.c1",
    ]);
    expect(store.peek().links.map((l) => l.id)).toEqual(["alice.c1"]);
  });

  it("a retried call with the same ID and pins is the same link, and an ID in use is refused", async () => {
    const store = createStore();
    const { model } = await open(store, "alice");
    const { from, to } = await sourceAndSink(model);
    const link = {
      op: "add-link" as const,
      id: "x1",
      a: { node: from.node, pin: from.port },
      b: { node: to.node, pin: to.port },
    };
    expect((await store.apply([link])).ok).toBe(true);
    expect((await store.apply([link])).ok).toBe(true);
    expect(store.peek().links).toHaveLength(1);
    expect(await store.apply([{ ...link, id: from.node }])).toMatchObject({
      ok: false,
      code: "id-in-use",
    });
  });
});
