import { describe, expect, it } from "vitest";
import {
  connectionKey,
  createSelectionModel,
} from "../../../view/interact/selection/selection-model.js";
import type { IdCursor, IdGenerator } from "../../base/ids/id-generator.js";
import { type ConnectionId, nodeId, portId } from "../../base/ids/ids.js";
import { MisuseError } from "../../base/result.js";
import type { Endpoint } from "../../data/model/records.js";
import { end, make, makeModel } from "../../edit/commands/test-kit.js";
import { createSnapshotModel } from "../../snapshot-model.js";
import {
  boxRegistry,
  fakeCreator,
  fakeHost,
  flush,
  hostSnapshot,
  seededModel,
  watch,
} from "./test-kit.js";

/**
 * A generator as a host would supply it: every ID carries a per-client token, so two
 * clients of one document never issue the same ID. `asked` records the kinds requested.
 */
function clientGenerator(token: string, asked: string[] = []): IdGenerator {
  return {
    next(kind, cursor: IdCursor) {
      asked.push(kind);
      const n = Number(cursor[kind] ?? 0) + 1;
      return { id: `${token}-${kind}-${n}`, cursor: { ...cursor, [kind]: n } };
    },
  };
}

const at = (node: string, port: string): Endpoint => ({
  node: nodeId(node),
  port: portId(port),
});

/** `hostSnapshot()` plus node C, and the given connections. */
function withC(connections: readonly Record<string, unknown>[] = []) {
  return hostSnapshot((s) => {
    s.nodes.push({
      id: "C",
      type: "box",
      position: { x: 0, y: 100 },
      size: { width: 40, height: 20 },
      ports: [{ id: "C.p", direction: "undirected", typeKey: "k" }],
      payload: null,
    });
    s.connections.push(...connections);
  });
}

/** Connect two ports and return the connection ID the client issued. */
function connectFrom(
  model: ReturnType<typeof seededModel>["model"],
  from: Endpoint,
  to: Endpoint,
): ConnectionId {
  const result = model.connect(from, to);
  if (result.status !== "pending") throw new Error(`got ${result.status}`);
  const id = model.reader.connections().at(-1)?.id;
  if (!id) throw new Error("no connection");
  return id;
}

describe("client-issued connection IDs", () => {
  it("a push that holds the connection under the client's ID produces no operation, and its selection survives", async () => {
    const { model, host } = seededModel({
      idGenerator: clientGenerator("tab7"),
    });
    model.pushSnapshot(withC());
    const selection = createSelectionModel();
    selection.bindToModel(model);
    const id = connectFrom(model, at("A", "A.out"), at("C", "C.p"));
    expect(id).toBe("tab7-connection-1");
    selection.replace([connectionKey(id)]);
    await flush();
    host.answer(host.calls[0]?.operationId ?? "", { status: "accepted" });
    await flush();
    const seen = watch(model);
    const pushed = model.pushSnapshot(
      withC([{ id, from: at("A", "A.out"), to: at("C", "C.p") }]),
    );
    // No change event, so nothing a gesture or the selection listens to happened.
    expect(pushed).toMatchObject({ status: "applied", operations: 0 });
    expect(seen.changes).toEqual([]);
    expect(selection.has(connectionKey(id))).toBe(true);
    expect(model.pendingEdits()).toEqual([]);
  });
});

describe("identifier generation under a delegating adapter", () => {
  it("node creation and duplicate never ask the generator; a connection asks for its own ID only", async () => {
    const asked: string[] = [];
    const creator = fakeCreator();
    const { model } = seededModel({
      idGenerator: clientGenerator("tab1", asked),
      registry: boxRegistry(),
      nodeCreation: "delegated",
      onDelegate: creator.onDelegate,
    });
    model.pushSnapshot(withC());
    model.createNode("box", { x: 5, y: 5 });
    model.execute({
      kind: "duplicate",
      nodes: [nodeId("A"), nodeId("B")],
      placement: { kind: "offset", by: { x: 0, y: 50 } },
    });
    expect(creator.intents.map((i) => i.kind)).toEqual([
      "create-node",
      "create-fragment",
    ]);
    connectFrom(model, at("B", "B.in"), at("C", "C.p"));
    expect(asked).toEqual(["connection"]);
  });
});

describe("globally unique IDs for a host-owned document", () => {
  it("creating a snapshot model without an ID generator throws a misuse error and creates nothing", () => {
    const host = fakeHost();
    let made: unknown;
    expect(() => {
      // @ts-expect-error the ID generator is a required option
      made = createSnapshotModel({ onSubmit: host.onSubmit });
    }).toThrow(MisuseError);
    expect(made).toBeUndefined();
  });

  it("two clients with per-client generators issue different first connection IDs, and one shared push shows both", async () => {
    const one = seededModel({ idGenerator: clientGenerator("client-a") });
    const two = seededModel({ idGenerator: clientGenerator("client-b") });
    for (const { model } of [one, two]) model.pushSnapshot(withC());
    const first = connectFrom(one.model, at("A", "A.out"), at("C", "C.p"));
    const second = connectFrom(two.model, at("B", "B.in"), at("C", "C.p"));
    expect(first).not.toBe(second);
    await flush();
    for (const { host } of [one, two])
      host.answer(host.calls[0]?.operationId ?? "", { status: "accepted" });
    await flush();
    const shared = withC([
      { id: first, from: at("A", "A.out"), to: at("C", "C.p") },
      { id: second, from: at("B", "B.in"), to: at("C", "C.p") },
    ]);
    for (const { model } of [one, two]) {
      expect(model.pushSnapshot(shared).status).toBe("applied");
      // Each client keeps its own connection where it was and adds the other one.
      expect(
        model.reader
          .connections()
          .map((c) => c.id)
          .sort(),
      ).toEqual(["AB", first, second].sort());
    }
  });

  it("a graph model on the local adapter still uses the default counter", () => {
    const model = makeModel();
    const a = make(model, "source");
    const b = make(model, "sink");
    expect(model.connect(end(a), end(b)).status).toBe("accepted");
    expect(model.reader.connections()[0]?.id).toMatch(/^c\d+$/);
    expect(a.node).toMatch(/^n\d+$/);
  });
});
