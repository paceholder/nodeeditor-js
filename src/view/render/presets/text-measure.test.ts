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
  it("widths are cached per font and string", () => {
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

  it("fit truncates with an ellipsis and never exceeds the width", () => {
    const m = createTextMeasurer();
    const { ctx } = ctxWith("12px a");
    expect(m.fit(ctx, "abc", 100)).toBe("abc");
    const fitted = m.fit(ctx, "abcdefghij", 55);
    expect(fitted).toBe("abcd…");
    expect(m.width(ctx, fitted)).toBeLessThanOrEqual(55);
    expect(m.fit(ctx, "abcdefghij", 5)).toBe("…");
  });
});

describe("cached text fitting", () => {
  it("a repeated frame of 500 truncated titles makes no text measurement", () => {
    const m = createTextMeasurer();
    const { ctx, calls } = ctxWith("12px a");
    const titles = Array.from(
      { length: 500 },
      (_, i) => `title ${i}: a rather long name that never fits its bar`,
    );
    const frame = (): string[] => titles.map((t) => m.fit(ctx, t, 120));
    const first = frame();
    const before = calls();
    expect(frame()).toEqual(first);
    expect(calls() - before).toBe(0);
    // A different width is a different fit.
    expect(m.fit(ctx, titles[0] ?? "", 60).length).toBeLessThan(
      first[0]?.length ?? 0,
    );
  });
});
