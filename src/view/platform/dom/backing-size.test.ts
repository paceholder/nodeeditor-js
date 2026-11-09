import { describe, expect, it } from "vitest";
import { backingSize, MAX_BACKING_AREA } from "./backing-size.js";

describe("device-pixel backing store", () => {
  it("takes the device-pixel box when the browser reports one", () => {
    // 333.6 CSS px at 1.5 rounds to 500, but the box the browser snapped to is 501.
    const b = backingSize({ width: 333.6, height: 100 }, 1.5, {
      width: 501,
      height: 150,
    });
    expect(b).toEqual({ pixelWidth: 501, pixelHeight: 150, dpr: 1.5 });
  });

  it("falls back to the CSS size times the ratio, rounded, and at least one pixel", () => {
    expect(backingSize({ width: 333.6, height: 100 }, 1.5)).toEqual({
      pixelWidth: 500,
      pixelHeight: 150,
      dpr: 1.5,
    });
    expect(backingSize({ width: 0.1, height: 0.1 }, 1)).toEqual({
      pixelWidth: 1,
      pixelHeight: 1,
      dpr: 1,
    });
  });

  it("caps the backing area and lowers the ratio to match", () => {
    const b = backingSize({ width: 10_000, height: 10_000 }, 2);
    expect(b.pixelWidth * b.pixelHeight).toBeLessThanOrEqual(MAX_BACKING_AREA);
    expect(b.pixelWidth).toBe(4096);
    expect(b.dpr).toBeCloseTo(0.4096, 6);
    // The same cap applies to a reported device box.
    const d = backingSize({ width: 5000, height: 5000 }, 2, {
      width: 10_000,
      height: 10_000,
    });
    expect(d.pixelWidth * d.pixelHeight).toBeLessThanOrEqual(MAX_BACKING_AREA);
    expect(d.dpr).toBeCloseTo(0.8192, 6);
  });

  it("ignores a device box measured at another ratio", () => {
    expect(
      backingSize({ width: 100, height: 100 }, 2, { width: 100, height: 100 }),
    ).toEqual({ pixelWidth: 200, pixelHeight: 200, dpr: 2 });
  });

  it("a container under the cap keeps its full ratio", () => {
    expect(backingSize({ width: 2560, height: 1440 }, 2).dpr).toBe(2);
  });
});
