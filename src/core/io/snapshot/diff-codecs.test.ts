import { describe, expect, it } from "vitest";
import { err, ok, rejectionOf } from "../../base/result.js";
import type { Payload } from "../../data/model/records.js";
import { diffSnapshot } from "./diff.js";
import { jsonEqual } from "./json-value.js";
import { loadSnapshot } from "./load.js";
import {
  createPayloadCodecRegistry,
  type PayloadCodec,
} from "./snapshot-errors.js";
import { makeTestModel } from "./test-kit.js";
import { validateSnapshot } from "./validate.js";

/** Payloads `{ at: <ms> }` decode into a `Date`. */
const dateCodec: PayloadCodec = {
  encode: (value) => ok({ at: (value as unknown as Date).getTime() } as never),
  decode: (json) =>
    ok(new Date((json as { at: number }).at) as unknown as Payload),
};

const snapshot = (at: number) => {
  const checked = validateSnapshot({
    format: "@paceholder/nodeeditor-js/graph",
    version: 1,
    nodes: [
      {
        id: "n1",
        type: "pipe",
        position: { x: 0, y: 0 },
        size: { width: 40, height: 20 },
        ports: [],
        payload: { at },
      },
    ],
    connections: [],
  });
  if (!checked.ok) throw new Error("fixture");
  return checked.value;
};

function loaded(codec: PayloadCodec = dateCodec) {
  const codecs = createPayloadCodecRegistry();
  codecs.register("pipe", codec);
  const model = makeTestModel();
  const r = loadSnapshot(model, snapshot(5), { codecs });
  if (!r.ok) throw new Error("fixture");
  return { model, codecs };
}

describe("snapshot diff honours payload codecs", () => {
  it("a model loaded with a date codec diffs empty against the same snapshot", () => {
    const { model, codecs } = loaded();
    const diff = diffSnapshot(model.reader, snapshot(5), { codecs });
    expect(diff.ok && diff.value.ops).toEqual([]);
  });

  it("a changed payload is decoded into the update", () => {
    const { model, codecs } = loaded();
    const diff = diffSnapshot(model.reader, snapshot(9), { codecs });
    if (!diff.ok) throw new Error("expected ok");
    expect(diff.value.ops).toHaveLength(1);
    const op = diff.value.ops[0];
    const change =
      op?.op === "update" && op.entity === "node"
        ? op.fields.payload
        : undefined;
    expect(change?.new).toBeInstanceOf(Date);
    expect((change?.new as unknown as Date | undefined)?.getTime()).toBe(9);
  });

  it("a codec failure is returned as an error, also when the codec throws", () => {
    const failing: PayloadCodec = {
      encode: () => err(rejectionOf("non-json-payload", "cannot encode")),
      decode: dateCodec.decode,
    };
    const { model, codecs } = loaded(failing);
    const diff = diffSnapshot(model.reader, snapshot(5), { codecs });
    expect(!diff.ok && diff.rejection.map((e) => e.path)).toEqual([
      "nodes[0].payload",
    ]);
    const throwing = createPayloadCodecRegistry();
    throwing.register("pipe", {
      encode: () => {
        throw new Error("boom");
      },
      decode: dateCodec.decode,
    });
    const thrown = diffSnapshot(model.reader, snapshot(5), {
      codecs: throwing,
    });
    expect(thrown.ok).toBe(false);
  });

  it("JSON equality calls two different dates, and a map and an object, unequal", () => {
    expect(jsonEqual(new Date(1), new Date(2))).toBe(false);
    expect(jsonEqual(new Map(), {})).toBe(false);
    const same = new Date(1);
    expect(jsonEqual(same, same)).toBe(true);
    expect(jsonEqual({ a: [1, { b: 2 }] }, { a: [1, { b: 2 }] })).toBe(true);
  });
});
