import { describe, expect, it } from "vitest";
import { nodeId } from "../../base/ids/ids.js";
import { ok, rejectionOf } from "../../base/result.js";
import { createPayloadCodecRegistry } from "../snapshot/snapshot-errors.js";
import {
  hostSnapshot,
  moveOf,
  positionOf,
  retitle,
  seeded,
  submission,
  watch,
} from "./test-kit.js";

const A = nodeId("A");
const refusal = rejectionOf("conflict", "Refused by the store", ["A"]);

/** Node A carries a payload its codec cannot encode back to JSON. */
function poisoned() {
  const codecs = createPayloadCodecRegistry();
  codecs.register("box", {
    decode: (json) => ok(json),
    encode: (value) =>
      (value as { poison?: boolean } | null)?.poison
        ? {
            ok: false,
            rejection: rejectionOf("non-json-payload", "cannot encode"),
          }
        : ok(value as never),
  });
  const s = seeded({ codecs });
  s.adapter.pushSnapshot(
    hostSnapshot((snap) => {
      (snap.nodes[0] as { payload: unknown }).payload = { poison: true };
    }),
  );
  return s;
}

describe("settling edits: a rejection whose display cannot be recomputed", () => {
  it("changes nothing displayed, keeps the other edits pending, reports the rejection and requests a resynchronization naming the codec failure", () => {
    const { adapter, logs } = poisoned();
    const move = submission(adapter, moveOf(adapter, "A", { x: 50, y: 5 }));
    adapter.submit(move);
    const title = submission(adapter, retitle(adapter, "B", "B2"));
    adapter.submit(title);
    const revision = adapter.revision();
    const seen = watch(adapter);
    const logged = logs.length;
    expect(
      adapter.settle(move.operationId, {
        status: "rejected",
        rejection: refusal,
      }),
    ).toBe(true);
    expect(adapter.revision()).toBe(revision);
    expect(positionOf(adapter, "A")).toEqual({ x: 50, y: 5 });
    expect(seen.changes).toEqual([]);
    expect(seen.conflicts).toEqual([]);
    expect(adapter.pendingEdits().map((e) => [e.operationId, e.state])).toEqual(
      [[title.operationId, "pending"]],
    );
    expect(seen.failures).toMatchObject([
      { operationId: move.operationId, rejection: refusal },
    ]);
    expect(seen.resyncs).toHaveLength(1);
    expect(seen.resyncs[0]?.operationId).toBe(move.operationId);
    expect(seen.resyncs[0]?.reason).toMatch(/cannot encode/);
    expect(logs.length).toBeGreaterThan(logged);
    expect(adapter.confirmedReader().getNode(A)?.position).toEqual({
      x: 0,
      y: 0,
    });
  });
});
