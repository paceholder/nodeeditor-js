import { describe, expect, it } from "vitest";
import {
  copiedPlacement,
  duplicatePlacement,
  INITIAL_PLACEMENT,
  type PlacementState,
  pastePlacement,
} from "./placement.js";

const step = { x: 20, y: 20 };

function pasteSeries(
  state: PlacementState,
  text: string,
  pointers: ({ x: number; y: number } | undefined)[],
) {
  const out = [];
  let s = state;
  for (const p of pointers) {
    const r = pastePlacement(s, text, p, step);
    out.push(r.placement);
    s = r.next;
  }
  return { placements: out, state: s };
}

describe("paste placement", () => {
  it("Paste at the pointer: centre at the pointer's world position", () => {
    const r = pastePlacement(copiedPlacement("F"), "F", { x: 5, y: 7 }, step);
    expect(r.placement).toEqual({ kind: "center", at: { x: 5, y: 7 } });
  });

  it("Paste without a pointer: one, two and three steps", () => {
    const { placements } = pasteSeries(copiedPlacement("F"), "F", [
      undefined,
      undefined,
      undefined,
    ]);
    expect(placements).toEqual([
      { kind: "offset", by: { x: 20, y: 20 } },
      { kind: "offset", by: { x: 40, y: 40 } },
      { kind: "offset", by: { x: 60, y: 60 } },
    ]);
  });

  it("a repeat at the same point adds the growing offset", () => {
    const at = { x: 100, y: 50 };
    const { placements } = pasteSeries(INITIAL_PLACEMENT, "F", [at, at, at]);
    expect(placements).toEqual([
      { kind: "center", at: { x: 100, y: 50 } },
      { kind: "center", at: { x: 120, y: 70 } },
      { kind: "center", at: { x: 140, y: 90 } },
    ]);
  });

  it("a moved pointer centres exactly at the new point", () => {
    const { placements } = pasteSeries(INITIAL_PLACEMENT, "F", [
      { x: 0, y: 0 },
      { x: 10, y: 10 },
    ]);
    expect(placements[1]).toEqual({ kind: "center", at: { x: 10, y: 10 } });
  });

  it("a new copy or a different fragment resets the count", () => {
    const { state } = pasteSeries(copiedPlacement("F"), "F", [
      undefined,
      undefined,
    ]);
    expect(state.pastes).toBe(2);
    expect(
      pastePlacement(copiedPlacement("F"), "F", undefined, step).placement,
    ).toEqual({ kind: "offset", by: { x: 20, y: 20 } });
    expect(pastePlacement(state, "G", undefined, step).placement).toEqual({
      kind: "offset",
      by: { x: 20, y: 20 },
    });
  });

  it("duplicate moves by a single step", () => {
    expect(duplicatePlacement(step)).toEqual({ kind: "offset", by: step });
    expect(duplicatePlacement({ x: 8, y: 0 })).toEqual({
      kind: "offset",
      by: { x: 8, y: 0 },
    });
  });
});
