import { describe, expect, it } from "vitest";
import { MisuseError } from "../result.js";
import { isWellFormedId, nodeId, portId } from "./ids.js";

describe("opaque IDs", () => {
  it("accepts non-empty strings without whitespace", () => {
    expect(isWellFormedId("n1")).toBe(true);
    expect(isWellFormedId("3f2b-uuid-like")).toBe(true);
  });

  it("rejects empty, whitespace and non-string values", () => {
    for (const bad of [
      "",
      " ",
      "a b",
      " n1",
      "n1\n",
      5,
      null,
      undefined,
      {},
      [],
    ]) {
      expect(isWellFormedId(bad)).toBe(false);
    }
  });

  it("brand constructors throw MisuseError for malformed IDs", () => {
    expect(nodeId("n1")).toBe("n1");
    expect(() => portId("")).toThrow(MisuseError);
    expect(() => nodeId("a b")).toThrow(MisuseError);
  });
});
