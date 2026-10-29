import { describe, expect, it } from "vitest";
import {
  createCounterIdGenerator,
  EMPTY_CURSOR,
  type IdGenerator,
} from "./id-generator.js";

const gen = createCounterIdGenerator();

describe("MOD-03a identifier generation", () => {
  it("mints prefixed sequences per kind", () => {
    let cursor = EMPTY_CURSOR;
    const ids: string[] = [];
    for (const kind of [
      "node",
      "node",
      "port",
      "connection",
      "node",
    ] as const) {
      const r = gen.next(kind, cursor);
      ids.push(r.id);
      cursor = r.cursor;
    }
    expect(ids).toEqual(["n1", "n2", "p1", "c1", "n3"]);
  });

  it("next is pure: same input gives same output and the input cursor is unchanged", () => {
    const cursor = { n: 4 };
    const a = gen.next("node", cursor);
    const b = gen.next("node", cursor);
    expect(a).toEqual(b);
    expect(a.id).toBe("n5");
    expect(cursor).toEqual({ n: 4 });
  });

  it("cursor is JSON round-trippable", () => {
    const { cursor } = gen.next("node", gen.next("port", EMPTY_CURSOR).cursor);
    const restored = JSON.parse(JSON.stringify(cursor));
    expect(restored).toEqual(cursor);
    expect(gen.next("node", restored).id).toBe("n2");
  });

  it("a deleted ID is not reused because the cursor never rewinds", () => {
    const first = gen.next("node", { n: 2 });
    expect(first.id).toBe("n3");
    expect(gen.next("node", first.cursor).id).toBe("n4");
  });
});

describe("MOD-03a observe external IDs", () => {
  const observe = (id: string, cursor: Record<string, number>) => {
    const f = gen.observe;
    if (!f) throw new Error("observe missing");
    return f(id, cursor);
  };

  it("observing n12 at cursor 9 makes the next node ID n13", () => {
    const c = observe("n12", { n: 9 });
    expect(gen.next("node", c).id).toBe("n13");
    expect(JSON.parse(JSON.stringify(c))).toEqual(c);
  });

  it("observing n3 at cursor 9 changes nothing", () => {
    const cursor = { n: 9 };
    expect(observe("n3", cursor)).toBe(cursor);
  });

  it("ignores foreign prefixes and non-numeric remainders", () => {
    const cursor = { n: 2 };
    expect(observe("x99", cursor)).toBe(cursor);
    expect(observe("nabc", cursor)).toBe(cursor);
    expect(observe("3f2b-uuid", cursor)).toBe(cursor);
  });

  it("advances the counter of the ID's own prefix only", () => {
    expect(observe("p7", { n: 2 })).toEqual({ n: 2, p: 7 });
  });
});

describe("MOD-03a host generator", () => {
  it("works through the same contract without observe", () => {
    let n = 0;
    const uuidLike: IdGenerator = {
      next: (_kind, cursor) => {
        n += 1;
        return {
          id: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
          cursor,
        };
      },
    };
    const r = uuidLike.next("node", EMPTY_CURSOR);
    expect(r.id).toBe("00000000-0000-4000-8000-000000000001");
    expect(uuidLike.observe).toBeUndefined();
    expect(uuidLike.next("port", r.cursor).id).not.toBe(r.id);
  });
});
