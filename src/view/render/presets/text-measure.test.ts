import { describe, expect, it } from "vitest";
import { createTextMeasurer } from "./text-measure.js";

function ctxWith(font: string) {
  let calls = 0;
  const ctx = {
    font,
    measureText: (t: string) => {
      calls++;
      return { width: t.length * 10 };
    },
  } as unknown as CanvasRenderingContext2D;
  return { ctx, calls: () => calls };
}

describe("text measurer", () => {
  it("PRE-02 widths are cached per font and string", () => {
    const m = createTextMeasurer();
    const a = ctxWith("12px a");
    expect(m.width(a.ctx, "hello")).toBe(50);
    expect(m.width(a.ctx, "hello")).toBe(50);
    expect(a.calls()).toBe(1);
    const b = ctxWith("14px b");
    m.width(b.ctx, "hello");
    expect(b.calls()).toBe(1);
    expect(m.measureCalls).toBe(2);
  });

  it("PRE-02 fit truncates with an ellipsis and never exceeds the width", () => {
    const m = createTextMeasurer();
    const { ctx } = ctxWith("12px a");
    expect(m.fit(ctx, "abc", 100)).toBe("abc");
    const fitted = m.fit(ctx, "abcdefghij", 55);
    expect(fitted).toBe("abcd…");
    expect(m.width(ctx, fitted)).toBeLessThanOrEqual(55);
    expect(m.fit(ctx, "abcdefghij", 5)).toBe("…");
  });
});
