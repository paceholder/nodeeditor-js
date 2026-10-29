import { describe, expect, it } from "vitest";
import {
  createFrameScheduler,
  type FrameClock,
  type LayerName,
} from "./frame-scheduler.js";

function fakeClock() {
  let next = 1;
  const pending = new Map<number, (t: number) => void>();
  let requests = 0;
  const clock: FrameClock = {
    request(cb) {
      requests += 1;
      pending.set(next, cb);
      return next++;
    },
    cancel: (h) => void pending.delete(h),
  };
  return {
    clock,
    requests: () => requests,
    pendingCount: () => pending.size,
    flush(t = 16) {
      const batch = [...pending.values()];
      pending.clear();
      for (const cb of batch) cb(t);
    },
  };
}

describe("frame scheduler", () => {
  it("LAY-02 many changes in one frame paint each dirty layer once", () => {
    const f = fakeClock();
    const painted: LayerName[] = [];
    const s = createFrameScheduler(f.clock, (l) => void painted.push(l));
    for (let i = 0; i < 100; i++) s.markDirty("scene");
    s.markDirty("interaction", "scene");
    expect(f.requests()).toBe(1);
    f.flush();
    expect(painted).toEqual(["scene", "interaction"]);
  });

  it("LAY-01 only dirty layers repaint", () => {
    const f = fakeClock();
    const painted: LayerName[] = [];
    const s = createFrameScheduler(f.clock, (l) => void painted.push(l));
    s.markDirty("interaction");
    f.flush();
    expect(painted).toEqual(["interaction"]);
  });

  it("LAY-02 idle editor makes zero frame requests", () => {
    const f = fakeClock();
    const s = createFrameScheduler(f.clock, () => {});
    expect(f.requests()).toBe(0);
    s.markDirty("scene");
    f.flush();
    f.flush();
    expect(f.requests()).toBe(1);
    expect(s.isPending()).toBe(false);
  });

  it("LAY-02 marking during a paint schedules exactly one next frame", () => {
    const f = fakeClock();
    let first = true;
    const s = createFrameScheduler(f.clock, () => {
      if (first) {
        first = false;
        s.markDirty("interaction");
      }
    });
    s.markDirty("scene");
    f.flush();
    expect(f.requests()).toBe(2);
    expect(f.pendingCount()).toBe(1);
  });

  it("LIFE-01 dispose cancels the pending frame and ignores later marks", () => {
    const f = fakeClock();
    const s = createFrameScheduler(f.clock, () => {});
    s.markDirty("scene");
    s.dispose();
    s.dispose();
    s.markDirty("scene");
    expect(f.pendingCount()).toBe(0);
    expect(f.requests()).toBe(1);
  });
});
