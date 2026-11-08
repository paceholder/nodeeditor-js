import { describe, expect, it } from "vitest";
import type { Rect } from "../../../core/index.js";
import { clientRectOf } from "../../platform/view-rect.js";
import { type OverlayPlacement, placeAtNode } from "./placement.js";

const body = { x: 100, y: 50, w: 80, h: 40 } as Rect<"world">;
const at = (zoom: number) => ({ zoom, panX: 10, panY: -20 });

describe("overlay placement", () => {
  it.each([
    // [placement, x, y, shiftX, shiftY] at zoom 2: body spans x 210..370, y 80..160
    ["top-left", 210, 80, 0, 0],
    ["top", 290, 80 - 8, -0.5, -1],
    ["bottom", 290, 160 + 8, -0.5, 0],
    ["left", 210 - 8, 120, -1, -0.5],
    ["right", 370 + 8, 120, 0, -0.5],
    ["center", 290, 120, -0.5, -0.5],
  ] as const)(
    "%s at zoom 2 with an 8 px offset",
    (placement: OverlayPlacement, x, y, shiftX, shiftY) => {
      const r = placeAtNode(body, at(2), placement, 8);
      expect(r.at.x).toBeCloseTo(x, 9);
      expect(r.at.y).toBeCloseTo(y, 9);
      expect(r.shiftX).toBe(shiftX);
      expect(r.shiftY).toBe(shiftY);
    },
  );

  it("the offset is constant in screen pixels at any zoom", () => {
    for (const zoom of [0.25, 1, 4]) {
      const r = placeAtNode(body, at(zoom), "top", 12);
      const top = 50 * zoom - 20;
      expect(r.at.y).toBeCloseTo(top - 12, 9);
      expect(r.at.x).toBeCloseTo(10 + (100 + 40) * zoom, 9);
    }
  });

  it("top-left and center ignore the offset; the default is top-left", () => {
    expect(placeAtNode(body, at(1), "center", 30).at).toEqual(
      placeAtNode(body, at(1), "center", 0).at,
    );
    expect(placeAtNode(body, at(1)).at).toEqual({ x: 110, y: 30 });
  });

  it("a node rectangle is the body bounds on screen in client pixels", () => {
    const r = clientRectOf(body, at(2), { left: 7, top: 11 });
    expect(r).toEqual({ x: 7 + 210, y: 11 + 80, width: 160, height: 80 });
  });
});
