import { describe, expect, it } from "vitest";
import { escapeDirection } from "./escape.js";

const w = (x: number, y: number) => ({ x, y });
const deg = (d: number) =>
  w(Math.cos((d * Math.PI) / 180), Math.sin((d * Math.PI) / 180));
const BODY = { x: 0, y: 0, w: 100, h: 60 };

describe("ROU-01c escape direction fallback", () => {
  it("ROU-01c Diagonal normal: 30 degrees below +x leaves to the right", () => {
    // Screen y points down, so "below" is +y.
    expect(escapeDirection(w(0, 0), deg(30), undefined, w(-50, 0))).toEqual(
      w(1, 0),
    );
    expect(escapeDirection(w(0, 0), deg(120), undefined, w(0, 0))).toEqual(
      w(0, 1),
    );
  });

  it("ROU-01c a 45-degree normal snaps to horizontal", () => {
    expect(escapeDirection(w(0, 0), w(-1, 1), undefined, w(9, 9))).toEqual(
      w(-1, 0),
    );
  });

  it("ROU-01c Zero normal: an anchor on the top side leaves upward", () => {
    expect(escapeDirection(w(40, 0), w(0, 0), BODY, w(500, 500))).toEqual(
      w(0, -1),
    );
    expect(escapeDirection(w(100, 30), w(0, 0), BODY, w(-500, 0))).toEqual(
      w(1, 0),
    );
    // A corner is equally near the right and bottom sides: right wins.
    expect(escapeDirection(w(100, 60), w(0, 0), BODY, w(0, 0))).toEqual(
      w(1, 0),
    );
  });

  it("ROU-01c a NaN normal without a body points toward the other end", () => {
    const nan = w(Number.NaN, 0);
    expect(escapeDirection(w(0, 0), nan, undefined, w(-30, 200))).toEqual(
      w(0, 1),
    );
    expect(escapeDirection(w(0, 0), nan, undefined, w(-30, 30))).toEqual(
      w(-1, 0),
    );
    // An anchor at the body centre also points toward the other end.
    expect(escapeDirection(w(50, 30), nan, BODY, w(50, -400))).toEqual(
      w(0, -1),
    );
  });

  it("ROU-01c coincident ends give +x", () => {
    expect(escapeDirection(w(5, 5), w(0, 0), undefined, w(5, 5))).toEqual(
      w(1, 0),
    );
  });
});
