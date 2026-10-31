import { describe, expect, it } from "vitest";
import { nodeId, type Point, viewportToWorld } from "../../../core/index.js";
import type { FrameClock } from "../../platform/frame-scheduler.js";
import {
  cornerNode,
  createToolHarness,
  type ToolHarness,
} from "../../test-support/tool-harness.js";
import { NO_MODIFIERS } from "../tools/tool-types.js";
import { createAutoPanDriver } from "./auto-pan-driver.js";

/** A frame clock that runs callbacks only when the test advances time. */
function fakeClock() {
  let next = 1;
  let now = 0;
  const pending = new Map<number, (t: number) => void>();
  const clock: FrameClock = {
    request(cb) {
      const id = next++;
      pending.set(id, cb);
      return id;
    },
    cancel: (id) => void pending.delete(id),
  };
  return {
    clock,
    pending: () => pending.size,
    /** Advance one frame of `ms` and run what was requested before it. */
    tick(ms = 16) {
      now += ms;
      const due = [...pending.values()];
      pending.clear();
      for (const cb of due) cb(now);
    },
  };
}

const SIZE = { width: 800, height: 600 };

/** A harness, a driver over it, and pointer helpers in viewport coordinates. */
function setup() {
  const h: ToolHarness = createToolHarness({
    nodes: [cornerNode("a", 100, 100), cornerNode("b", 100, 300)],
  });
  const time = fakeClock();
  const driver = createAutoPanDriver({
    clock: time.clock,
    router: h.router,
    size: () => SIZE,
    options: () => ({ edgePx: 32, maxSpeedPxPerSecond: 600 }),
    panBy: (dx, dy) => h.applyViewport({ kind: "panBy", dx, dy }),
    toWorld: (p) => viewportToWorld(h.viewport(), p),
    send: (input) => void h.send(input),
  });
  return { h, time, driver };
}

/** Send a pointer event at a viewport point, then let the driver re-evaluate. */
function pointer(
  s: ReturnType<typeof setup>,
  type: "pointer-down" | "pointer-move" | "pointer-up",
  at: Point<"viewport">,
  shift = false,
) {
  const input = {
    type,
    pointerId: 1,
    button: 0 as const,
    viewport: at,
    world: viewportToWorld(s.h.viewport(), at),
    modifiers: { ...NO_MODIFIERS, shift },
    time: 0,
  };
  s.h.send(input);
  s.driver.update(input);
}

describe("INT-09, INT-08, PERF-02d auto-pan driver", () => {
  it("Node drag near the edge: the view pans and the preview follows the pointer", () => {
    const s = setup();
    pointer(s, "pointer-down", { x: 120, y: 110 });
    pointer(s, "pointer-move", { x: 400, y: 110 });
    expect(s.time.pending()).toBe(0);
    pointer(s, "pointer-move", { x: 784, y: 110 });
    expect(s.time.pending()).toBe(1);
    const before = s.h.log.previews.at(-1);
    for (let i = 0; i < 10; i++) s.time.tick(16);
    // 300 px/s at half the band depth; the first frame counts as 1/60 s.
    expect(s.h.viewport().panX).toBeCloseTo(-(300 * (1 / 60 + 9 * 0.016)), 9);
    const after = s.h.log.previews.at(-1);
    expect(before?.kind).toBe("move");
    expect(after?.kind === "move" && before?.kind === "move").toBe(true);
    if (after?.kind === "move" && before?.kind === "move") {
      // The node stays under the pointer: its offset grows by the distance panned.
      expect(after.offset.x - before.offset.x).toBeCloseTo(
        -s.h.viewport().panX,
        9,
      );
    }
    expect(s.h.log.commits).toEqual([]);
  });

  it("Stop on release: no pending request after pointer-up", () => {
    const s = setup();
    pointer(s, "pointer-down", { x: 120, y: 110 });
    pointer(s, "pointer-move", { x: 795, y: 110 });
    s.time.tick();
    expect(s.time.pending()).toBe(1);
    pointer(s, "pointer-up", { x: 795, y: 110 });
    expect(s.time.pending()).toBe(0);
    expect(s.driver.isPending()).toBe(false);
    const panX = s.h.viewport().panX;
    for (let i = 0; i < 5; i++) s.time.tick();
    expect(s.h.viewport().panX).toBe(panX);
  });

  it("Cancel during auto-pan: Escape on a marquee stops at once and keeps the viewport", () => {
    const s = setup();
    pointer(s, "pointer-down", { x: 400, y: 500 }, true);
    pointer(s, "pointer-move", { x: 420, y: 595 }, true);
    expect(s.h.router.activeTool).toBe("marquee");
    s.time.tick();
    s.time.tick();
    const panned = s.h.viewport();
    expect(panned.panY).toBeLessThan(0);
    const escapeKey = {
      type: "key-down",
      key: "Escape",
      modifiers: NO_MODIFIERS,
    } as const;
    s.h.send(escapeKey);
    s.driver.update(escapeKey);
    expect(s.time.pending()).toBe(0);
    expect(s.h.log.previews.at(-1)).toBeNull();
    s.time.tick();
    expect(s.h.viewport()).toEqual(panned);
  });

  it("Auto-panned move is one history entry over 120 ticks", () => {
    const s = setup();
    const changes: number[] = [];
    s.h.model.on("change", (e) => changes.push(e.patch.ops.length));
    pointer(s, "pointer-down", { x: 120, y: 110 });
    pointer(s, "pointer-move", { x: 900, y: 110 });
    for (let i = 0; i < 120; i++) s.time.tick(16);
    // Capped at 600 px/s however far outside the view the pointer is.
    expect(s.h.viewport().panX).toBeCloseTo(-(600 * (1 / 60 + 119 * 0.016)), 6);
    expect(s.h.log.commits).toEqual([]);
    pointer(s, "pointer-up", { x: 900, y: 110 });
    expect(s.h.log.commits).toHaveLength(1);
    expect(changes).toEqual([1]);
    const moved = s.h.model.reader.getNode(nodeId("a"))?.position.x ?? 0;
    // The node landed under the release point in world space.
    expect(moved).toBeCloseTo(120 + 780 - s.h.viewport().panX, 6);
  });

  it("caps a long frame at 50 ms", () => {
    const s = setup();
    pointer(s, "pointer-down", { x: 120, y: 110 });
    pointer(s, "pointer-move", { x: 900, y: 110 });
    s.time.tick(16);
    const first = s.h.viewport().panX;
    s.time.tick(5000);
    expect(s.h.viewport().panX - first).toBeCloseTo(-600 * 0.05, 9);
  });

  it("dispose cancels a pending frame and ignores later updates", () => {
    const s = setup();
    pointer(s, "pointer-down", { x: 120, y: 110 });
    pointer(s, "pointer-move", { x: 900, y: 110 });
    expect(s.time.pending()).toBe(1);
    s.driver.dispose();
    expect(s.time.pending()).toBe(0);
    pointer(s, "pointer-move", { x: 905, y: 110 });
    expect(s.time.pending()).toBe(0);
  });
});
