import { describe, expect, it } from "vitest";
import { FORMAT_VERSION } from "./index.js";

describe("core entry", () => {
  it("is importable in Node without browser globals", () => {
    expect(FORMAT_VERSION).toBe(1);
  });
});
