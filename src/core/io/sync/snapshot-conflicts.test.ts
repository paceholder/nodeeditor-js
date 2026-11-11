import { describe, expect, it } from "vitest";
import {
  connectionKey,
  createSelectionModel,
} from "../../../view/interact/selection/selection-model.js";
import { type ConnectionId, nodeId, portId } from "../../base/ids/ids.js";
import { type Rejection, rejectionOf } from "../../base/result.js";
import type { Endpoint } from "../../data/model/records.js";
import type { Deferred } from "../../edit/adapter/types.js";
import { flush, hostSnapshot, seededModel, watch } from "./test-kit.js";

const at = (node: string, port: string): Endpoint => ({
  node: nodeId(node),
  port: portId(port),
});
const FROM = at("A", "A.out");
const TO = at("C", "C.p");

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

/**
 * A snapshot model whose host validator accepts every connection, with a new connection
 * from A to C that the validator approved, selected, and handed to the host.
 */
async function approvedConnection() {
  const verdicts: string[] = [];
  const seededWith = seededModel({
    connectionValidator: async (request) => {
      verdicts.push(
        `${request.proposal.from.port}-${request.proposal.to.port}`,
      );
      return { valid: true };
    },
  });
  const { model, host } = seededWith;
  model.pushSnapshot(withC());
  const first = model.connect(FROM, TO);
  if (first.status !== "unverified") throw new Error(first.status);
  await model.verifyConnections(first.missing);
  const result = model.connect(FROM, TO);
  if (result.status !== "pending") throw new Error(result.status);
  const id = model.reader.connections().at(-1)?.id as ConnectionId;
  const selection = createSelectionModel();
  selection.bindToModel(model);
  selection.replace([connectionKey(id)]);
  await flush();
  return { model, host, id, selection, verdicts, result: result as Deferred };
}

async function rejectWith(rejection: Rejection) {
  const s = await approvedConnection();
  const seen = watch(s.model);
  const operation = s.host.calls[0]?.operationId ?? "";
  s.host.answer(operation, { status: "rejected", rejection });
  await flush();
  return { ...s, seen, settled: await s.result.settled };
}

describe("client-named connections keep their IDs and conflicts roll back", () => {
  it("an already-connected answer after an accepted validator verdict removes the connection in one event, with one failure event carrying the host's rejection, and nothing is resubmitted", async () => {
    const refusal = rejectionOf(
      "duplicate-connection",
      "A and C are already connected in the store",
      ["A.out", "C.p"],
    );
    const { model, host, id, selection, verdicts, seen, settled } =
      await rejectWith(refusal);
    expect(verdicts).toEqual(["A.out-C.p"]);
    expect(model.reader.getConnection(id)).toBeUndefined();
    expect(seen.changes).toHaveLength(1);
    expect(seen.changes[0]).toMatchObject({
      origin: "external",
      changed: { connections: [id] },
    });
    expect(seen.changes[0]?.patch.ops).toMatchObject([
      { op: "remove", entity: "connection", record: { id } },
    ]);
    expect(seen.failures).toEqual([
      expect.objectContaining({ rejection: refusal }),
    ]);
    expect(settled).toMatchObject({ status: "rejected", rejection: refusal });
    expect(selection.has(connectionKey(id))).toBe(false);
    expect(host.calls).toHaveLength(1);
    expect(model.pendingEdits()).toEqual([]);
  });

  it("an ID-claimed answer settles rejected with connection-id-claimed and rolls the local connection back", async () => {
    const refusal = rejectionOf(
      "connection-id-claimed",
      "Another record of the store already uses this ID",
    );
    const { model, host, id, selection, seen, settled } =
      await rejectWith(refusal);
    expect(settled).toMatchObject({
      status: "rejected",
      rejection: { code: "connection-id-claimed" },
    });
    expect(model.reader.getConnection(id)).toBeUndefined();
    expect(seen.changes).toHaveLength(1);
    expect(seen.failures).toHaveLength(1);
    expect(selection.size).toBe(0);
    expect(host.calls).toHaveLength(1);
  });

  it("a snapshot that holds the new connection under another ID removes the local one and adds the other, with no pairing", async () => {
    const { model, host, id } = await approvedConnection();
    host.answer(host.calls[0]?.operationId ?? "", { status: "accepted" });
    await flush();
    const seen = watch(model);
    model.pushSnapshot(withC([{ id: "store-9", from: FROM, to: TO }]));
    expect(seen.changes).toHaveLength(1);
    const ops = seen.changes[0]?.patch.ops ?? [];
    expect(
      ops.map((op) => [op.op, op.op === "update" ? op.id : op.record.id]),
    ).toEqual([
      ["remove", id],
      ["add", "store-9"],
    ]);
    expect(seen.changes[0]?.origin).toBe("external");
    expect(model.reader.connections().map((c) => c.id)).toEqual([
      "AB",
      "store-9",
    ]);
  });
});
