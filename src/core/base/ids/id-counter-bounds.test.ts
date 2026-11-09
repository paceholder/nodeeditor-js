import { describe, expect, it } from "vitest";
import { MisuseError } from "../result.js";
import { createCounterIdGenerator, EMPTY_CURSOR } from "./id-generator.js";

const gen = createCounterIdGenerator();

describe("ID counters never wrap or reset", () => {
  it("ignores an observed counter above 2^50", () => {
    const id = `n${Number.MAX_SAFE_INTEGER}`;
    expect(gen.observe?.(id, EMPTY_CURSOR)).toEqual(EMPTY_CURSOR);
    expect(gen.observe?.(`n${2 ** 50}`, EMPTY_CURSOR)).toEqual({ n: 2 ** 50 });
  });

  it("refuses to mint past the largest safe integer", () => {
    expect(() => gen.next("node", { n: Number.MAX_SAFE_INTEGER })).toThrow(
      MisuseError,
    );
    expect(gen.next("node", { n: Number.MAX_SAFE_INTEGER - 1 }).id).toBe(
      `n${Number.MAX_SAFE_INTEGER}`,
    );
  });

  it("refuses a counter that is not a non-negative safe integer instead of restarting", () => {
    for (const n of [1e300, 1.5, -3, "7"]) {
      expect(() => gen.next("node", { n })).toThrow(MisuseError);
    }
    expect(gen.next("node", { n: 0 }).id).toBe("n1");
  });
});
