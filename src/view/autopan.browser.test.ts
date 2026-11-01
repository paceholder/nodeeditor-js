/// <reference types="@vitest/browser-playwright" />
import { describe, expect, it, vi } from "vitest";
import { nodeId, viewportToWorld } from "../core/index.js";
import { buildModel, twoPortNode } from "../core/space/scene/scene-fixtures.js";
import { cleanupScope, frames, makeHost, until } from "./browser-support.js";
import { key, mouse } from "./interact/input/input-test-support.js";
import { mountView } from "./mount-view.js";

const cleanup = cleanupScope();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Spy on animation frames: requests made, and requests still pending. */
function trackFrames() {
  const pending = new Set<number>();
  let requests = 0;
  const raf = window.requestAnimationFrame.bind(window);
  const caf = window.cancelAnimationFrame.bind(window);
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => {
    requests++;
    const id = raf((t) => {
      pending.delete(id);
      cb(t);
    });
    pending.add(id);
    return id;
  });
  vi.spyOn(window, "cancelAnimationFrame").mockImplementation((id) => {
    pending.delete(id);
    caf(id);
  });
  cleanup(() => void vi.restoreAllMocks());
  return { pending: () => pending.size, requests: () => requests };
}

async function setup() {
  const model = buildModel([twoPortNode("a", 100, 100)]);
  const view = mountView(makeHost(600, 400), {
    model,
    input: { platform: "other" },
  });
  cleanup(() => view.dispose());
  await frames(3);
  const pointer = mouse(view);
  /** World point under a viewport point, for the live viewport. */
  const at = (vx: number, vy: number) => {
    const w = viewportToWorld(view.viewport.get(), { x: vx, y: vy });
    return [w.x, w.y] as const;
  };
  return { model, view, pointer, at };
}

describe("auto-pan in the browser", () => {
  it("a node dragged into the right edge band pans, follows, and stops on release", async () => {
    const { model, view, pointer, at } = await setup();
    const track = trackFrames();
    pointer.down(100, 100);
    pointer.move(...at(300, 100));
    pointer.move(...at(590, 100));
    await until(() => view.viewport.get().panX < -60);
    const release = at(590, 100);
    pointer.up(...release);
    const stopped = view.viewport.get();
    // The node landed under the release point, one history entry.
    expect(model.reader.getNode(nodeId("a"))?.position.x).toBeCloseTo(
      release[0],
      6,
    );
    expect(model.historyState().undoLabel).toBe("Move");
    // Repaints for the commit settle; then nothing is requested for five seconds.
    await sleep(300);
    expect(view.viewport.get()).toEqual(stopped);
    const before = track.requests();
    await sleep(5000);
    expect(track.requests()).toBe(before);
    expect(track.pending()).toBe(0);
  }, 10_000);

  it("Escape during a marquee stops panning at once and keeps the viewport", async () => {
    const { view, pointer, at } = await setup();
    pointer.down(...at(300, 300), { shift: true });
    pointer.move(...at(320, 340), { shift: true });
    pointer.move(...at(320, 398), { shift: true });
    await until(() => view.viewport.get().panY < -30);
    key(view.element, "Escape");
    const stopped = view.viewport.get();
    await sleep(200);
    expect(view.viewport.get()).toEqual(stopped);
  });

  it("dispose mid-pan leaves no pending frame", async () => {
    const { view, pointer, at } = await setup();
    const track = trackFrames();
    pointer.down(100, 100);
    pointer.move(...at(300, 100));
    pointer.move(...at(595, 100));
    await until(() => view.viewport.get().panX < -30);
    expect(track.pending()).toBeGreaterThan(0);
    view.dispose();
    expect(track.pending()).toBe(0);
    const before = track.requests();
    await sleep(200);
    expect(track.requests()).toBe(before);
  });

  it("autoPan: false keeps the viewport still", async () => {
    const { view, pointer, at } = await setup();
    view.setToolOptions({ autoPan: false });
    pointer.down(100, 100);
    pointer.move(...at(300, 100));
    pointer.move(...at(595, 100));
    await sleep(200);
    expect(view.viewport.get().panX).toBe(0);
    pointer.up(...at(595, 100));
  });
});
