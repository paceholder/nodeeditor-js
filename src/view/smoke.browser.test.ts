import { describe, expect, it } from "vitest";

describe("browser smoke", () => {
  it("runs in a real browser with a canvas", () => {
    const canvas = document.createElement("canvas");
    expect(canvas.getContext("2d")).not.toBeNull();
    expect(typeof window.devicePixelRatio).toBe("number");
  });
});
