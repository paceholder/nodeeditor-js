import { describe, expect, it } from "vitest";
import type { IdCursor, IdGenerator } from "../../base/ids/id-generator.js";
import { makeModel } from "../commands/test-kit.js";
import { mergeCursor } from "./cursor.js";

/** A host generator that keeps a text counter per kind and has no observe or merge. */
const textGenerator = (): IdGenerator => ({
  next(kind, cursor) {
    const next = `${String(cursor[kind] ?? "")}a`;
    return { id: `${kind}-${next}`, cursor: { ...cursor, [kind]: next } };
  },
});

const create = (model: ReturnType<typeof makeModel>) =>
  model.execute({
    kind: "createNode",
    type: "source",
    position: { x: 0, y: 0 },
  });

describe("ID cursors merge forward for numbers and text", () => {
  it("a text counter without observe or merge advances on every create", () => {
    const model = makeModel({ idGenerator: textGenerator() });
    const ids = [1, 2, 3, 4].map(() => {
      const r = create(model);
      if (r.status !== "accepted") throw new Error(`create ${r.status}`);
      return r.changed.nodes[0];
    });
    expect(new Set(ids).size).toBe(4);
  });

  it("numbers keep the larger value and text takes the incoming value", () => {
    expect(mergeCursor({ n: 5, t: "b" }, { n: 3, t: "a" })).toEqual({
      n: 5,
      t: "a",
    });
    expect(mergeCursor({ n: 5 }, { n: 7, m: 1 })).toEqual({ n: 7, m: 1 });
  });

  it("a generator's own merge decides", () => {
    const calls: [IdCursor, IdCursor][] = [];
    const generator: IdGenerator = {
      ...textGenerator(),
      merge(current, incoming) {
        calls.push([current, incoming]);
        return { ...incoming, merged: 1 };
      },
    };
    const model = makeModel({ idGenerator: generator });
    create(model);
    expect(calls).toHaveLength(1);
    expect(model.idCursor()).toMatchObject({ merged: 1 });
  });
});
