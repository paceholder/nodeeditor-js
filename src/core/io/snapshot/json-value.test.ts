import { describe, expect, it } from "vitest";
import { checkJson, cloneJson, jsonEqual } from "./json-value.js";

describe("checkJson", () => {
  it("accepts nested plain data", () => {
    expect(
      checkJson({ a: [1, "x", null, { b: true }] }, "payload"),
    ).toBeUndefined();
  });

  it.each([
    ["Date", new Date()],
    ["Map", new Map()],
    ["undefined", undefined],
    ["function", () => 1],
    ["NaN", Number.NaN],
    ["Infinity", Number.POSITIVE_INFINITY],
    ["class instance", new (class Foo {})()],
    ["bigint", 1n],
    ["symbol", Symbol("s")],
  ])("rejects %s with its path", (_name, value) => {
    const problem = checkJson({ a: [0, value] }, "payload");
    expect(problem?.path).toBe("payload.a[1]");
    expect(problem?.kind).toBe("non-json");
  });

  it("rejects a nested undefined field and sparse arrays", () => {
    expect(checkJson({ a: undefined }, "p")?.path).toBe("p.a");
    // biome-ignore lint/suspicious/noSparseArray: sparse input is the case under test
    expect(checkJson([1, , 3], "p")?.reason).toBe("sparse array");
  });

  it("rejects cycles without overflowing the stack", () => {
    const a: Record<string, unknown> = {};
    a.self = a;
    expect(checkJson(a, "p")?.reason).toBe("circular reference");
  });

  it("reports excessive depth as a depth problem", () => {
    let deep: unknown = 1;
    for (let i = 0; i < 10; i += 1) deep = { d: deep };
    expect(checkJson(deep, "p", 5)?.kind).toBe("depth");
    expect(checkJson(deep, "p", 50)).toBeUndefined();
  });

  it("compares deeply regardless of key order and copies without sharing", () => {
    expect(jsonEqual({ a: 1, b: [1, 2] }, { b: [1, 2], a: 1 })).toBe(true);
    expect(jsonEqual({ a: 1 }, { a: 2 })).toBe(false);
    const src = { a: { b: 1 } };
    const copy = cloneJson(src);
    expect(copy).toEqual(src);
    expect(copy.a).not.toBe(src.a);
  });

  it("clones a __proto__ key as plain data", () => {
    const parsed = JSON.parse('{"__proto__":{"x":1}}') as object;
    const copy = cloneJson(parsed);
    expect(Object.getPrototypeOf(copy)).toBe(Object.prototype);
    expect(Object.keys(copy)).toEqual(["__proto__"]);
  });
});
