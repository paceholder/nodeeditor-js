import { describe, expect, it } from "vitest";
import type { PointerType } from "../tools/tool-types.js";
import {
  LONG_PRESS_IDLE,
  type LongPressInput,
  type LongPressState,
  longPressStep,
} from "./long-press.js";

const TOUCH_PX = 6;

/** Feed inputs from idle; returns the final state and every action. */
function run(inputs: readonly LongPressInput[]) {
  let state: LongPressState = LONG_PRESS_IDLE;
  const actions: string[] = [];
  for (const input of inputs) {
    const next = longPressStep(state, input, TOUCH_PX);
    state = next.state;
    actions.push(next.action);
  }
  return { state, actions };
}

const down = (
  pointerType: PointerType = "touch",
  enabled = true,
  pointerId = 1,
): LongPressInput => ({
  type: "down",
  pointerId,
  pointerType,
  viewport: { x: 100, y: 100 },
  enabled,
});
const move = (dx: number, pointerId = 1): LongPressInput => ({
  type: "move",
  pointerId,
  viewport: { x: 100 + dx, y: 100 },
});

describe("INT-11c, INT-11b touch long-press", () => {
  it("Touch long-press fires once at the timeout; the release is swallowed", () => {
    const r = run([down(), move(2), { type: "timeout" }, { type: "timeout" }]);
    expect(r.actions).toEqual(["arm", "none", "fire", "none"]);
    expect(r.state.kind).toBe("fired");
    const end = longPressStep(r.state, { type: "up", pointerId: 1 }, TOUCH_PX);
    expect(end).toEqual({ state: LONG_PRESS_IDLE, action: "none" });
  });

  it("Touch drag before the long-press disarms at 7 px but not at 5 px", () => {
    expect(run([down(), move(5), { type: "timeout" }]).actions).toEqual([
      "arm",
      "none",
      "fire",
    ]);
    expect(run([down(), move(7), { type: "timeout" }]).actions).toEqual([
      "arm",
      "disarm",
      "none",
    ]);
  });

  it("a second touch disarms", () => {
    const r = run([down(), down("touch", true, 2), { type: "timeout" }]);
    expect(r.actions).toEqual(["arm", "disarm", "none"]);
    expect(r.state).toEqual(LONG_PRESS_IDLE);
  });

  it("mouse and pen never arm", () => {
    expect(run([down("mouse"), { type: "timeout" }]).actions).toEqual([
      "none",
      "none",
    ]);
    expect(run([down("pen"), { type: "timeout" }]).actions).toEqual([
      "none",
      "none",
    ]);
  });

  it("Long-press turned off (or no listener) never arms", () => {
    expect(run([down("touch", false), { type: "timeout" }]).state).toEqual(
      LONG_PRESS_IDLE,
    );
  });

  it("release and cancel disarm", () => {
    expect(run([down(), { type: "up", pointerId: 1 }]).actions).toEqual([
      "arm",
      "disarm",
    ]);
    expect(run([down(), { type: "cancel" }]).actions).toEqual([
      "arm",
      "disarm",
    ]);
  });

  it("a native context menu before the timeout fires instead of the timer", () => {
    const r = run([
      down(),
      { type: "native-contextmenu", pointerId: 1 },
      { type: "timeout" },
    ]);
    expect(r.actions).toEqual(["arm", "fire", "none"]);
  });

  it("a native context menu after the fire is swallowed", () => {
    const r = run([
      down(),
      { type: "timeout" },
      { type: "native-contextmenu" },
    ]);
    expect(r.actions).toEqual(["arm", "fire", "swallow"]);
  });

  it("a native context menu with nothing armed takes the normal path", () => {
    expect(run([{ type: "native-contextmenu" }]).actions).toEqual(["none"]);
  });
});
