import { describe, expect, it } from "vitest";
import type { FrameClock } from "../../platform/frame-scheduler.js";
import type { CursorKind } from "../tools/tool-types.js";
import { createIdleCursor } from "./idle-cursor.js";

function manualClock() {
  const pending = new Map<number, (t: number) => void>();
  let next = 1;
  const clock: FrameClock = {
    request(cb) {
      pending.set(next, cb);
      return next++;
    },
    cancel: (h) => void pending.delete(h),
  };
  return {
    clock,
    pending: () => pending.size,
    run() {
      const batch = [...pending.values()];
      pending.clear();
      for (const cb of batch) cb(0);
    },
  };
}

describe("throttled idle pointer work", () => {
  it("twenty moves before a frame run the cursor hit test once, for the last position", () => {
    const m = manualClock();
    const asked: Array<[number, number]> = [];
    const set: CursorKind[] = [];
    const idle = createIdleCursor({
      clock: m.clock,
      cursorAt: (x, y) => {
        asked.push([x, y]);
        return x > 15 ? "crosshair" : "default";
      },
      setCursor: (c) => void set.push(c),
    });
    for (let i = 0; i < 20; i++) idle.move(i, 0);
    expect(asked).toEqual([]);
    expect(m.pending()).toBe(1);
    m.run();
    expect(asked).toEqual([[19, 0]]);
    expect(set).toEqual(["crosshair"]);
    // The next burst asks once again.
    idle.move(3, 0);
    idle.move(4, 0);
    m.run();
    expect(asked).toEqual([
      [19, 0],
      [4, 0],
    ]);
  });

  it("a cancelled request (a gesture started, the pointer left) runs nothing", () => {
    const m = manualClock();
    let asked = 0;
    const idle = createIdleCursor({
      clock: m.clock,
      cursorAt: () => {
        asked++;
        return undefined;
      },
      setCursor: () => {},
    });
    idle.move(1, 1);
    idle.cancel();
    expect(m.pending()).toBe(0);
    m.run();
    idle.move(2, 2);
    idle.dispose();
    m.run();
    expect(asked).toBe(0);
  });
});
