import { describe, expect, it } from "vitest";
import { sameData } from "./same-data.js";

describe("props compared by value", () => {
  it("equal nested plain data is the same, a changed leaf is not", () => {
    expect(
      sameData({ a: 1, b: { c: [1, 2] } }, { a: 1, b: { c: [1, 2] } }),
    ).toBe(true);
    expect(
      sameData({ a: 1, b: { c: [1, 2] } }, { a: 1, b: { c: [1, 3] } }),
    ).toBe(false);
    expect(sameData({ a: 1 }, { a: 1, b: undefined })).toBe(false);
    expect(sameData([1], { 0: 1 })).toBe(false);
  });

  it("functions and class instances compare by identity", () => {
    const f = () => 1;
    expect(sameData({ f }, { f })).toBe(true);
    expect(sameData({ f }, { f: () => 1 })).toBe(false);
    class Box {
      x = 1;
    }
    expect(sameData(new Box(), new Box())).toBe(false);
  });

  it("undefined and primitives", () => {
    expect(sameData(undefined, undefined)).toBe(true);
    expect(sameData(undefined, {})).toBe(false);
    expect(sameData(NaN, NaN)).toBe(true);
  });
});
