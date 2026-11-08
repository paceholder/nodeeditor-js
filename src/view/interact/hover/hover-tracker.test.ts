import { describe, expect, it } from "vitest";
import {
  nodeId,
  type Point,
  portId,
  viewportToWorld,
} from "../../../core/index.js";
import type { FrameClock } from "../../platform/frame-scheduler.js";
import { viewRect } from "../../platform/view-rect.js";
import {
  cornerNode,
  createToolHarness,
} from "../../test-support/tool-harness.js";
import { capabilityProbe, createToolContext } from "../tools/tool-context.js";
import { createHoverTracker } from "./hover-tracker.js";
import type { HoverEvent } from "./hover-types.js";

/** A node a at (0,0)-(40,20), b at (100,0)-(140,20), a connection a to b. */
function setup(opts: { hidePortsBelow?: number; zoom?: number } = {}) {
  const viewport = { zoom: opts.zoom ?? 1, panX: 0, panY: 0 };
  const h = createToolHarness({
    nodes: [cornerNode("a", 0, 0), cornerNode("b", 100, 0)],
    connections: [["c", "a", "aR", "b", "bL"]],
    viewport,
  });
  const context = createToolContext({
    reader: h.model.reader,
    scene: h.scene,
    selection: h.selection,
    viewport: () => viewport,
    can: capabilityProbe(h.model),
    ...(opts.hidePortsBelow === undefined
      ? {}
      : { hidePortsBelow: () => opts.hidePortsBelow ?? 0 }),
  });
  // A manual frame clock: requests queue until `flush`.
  let queue: Array<(t: number) => void> = [];
  const clock: FrameClock = {
    request: (cb) => queue.push(cb),
    cancel: () => {
      queue = [];
    },
  };
  const flush = () => {
    const run = queue;
    queue = [];
    for (const cb of run) cb(0);
  };
  let gesture = false;
  const events: HoverEvent[] = [];
  const tracker = createHoverTracker({
    pickAt: (x, y) =>
      context().pick(viewportToWorld(viewport, { x, y }) as Point<"world">),
    nodeRect: (id) => (id === "a" ? viewRect(1, 2, 40, 20) : undefined),
    gesture: () => gesture,
    clock,
    emit: (e) => events.push(e),
  });
  return {
    h,
    tracker,
    events,
    flush,
    setGesture: (g: boolean) => {
      gesture = g;
    },
    queued: () => queue.length,
  };
}

const ON_A: readonly [number, number] = [20, 10];
const ON_B: readonly [number, number] = [120, 10];
const EMPTY: readonly [number, number] = [70, 90];

describe("hover tracker", () => {
  it("enter, move within, leave: one event each, none within", () => {
    const s = setup();
    s.tracker.move(...ON_A);
    s.flush();
    s.tracker.move(22, 11);
    s.flush();
    s.tracker.move(25, 12);
    s.flush();
    expect(s.events).toHaveLength(1);
    expect(s.events[0]?.target).toEqual({ kind: "node", node: nodeId("a") });
    s.tracker.move(...EMPTY);
    s.flush();
    expect(s.events).toHaveLength(2);
    expect(s.events[1]).toEqual({ target: null });
  });

  it("a node event carries the node's screen rectangle", () => {
    const s = setup();
    s.tracker.move(...ON_A);
    s.flush();
    expect(s.events[0]?.rect).toEqual(viewRect(1, 2, 40, 20));
    s.tracker.move(...ON_B);
    s.flush();
    expect(s.events[1]?.target).toEqual({ kind: "node", node: nodeId("b") });
    expect(s.events[1]).not.toHaveProperty("rect");
  });

  it("a burst of moves in one frame raises one event for the final entity", () => {
    const s = setup();
    s.tracker.move(...ON_A);
    s.tracker.move(...EMPTY);
    s.tracker.move(...ON_B);
    expect(s.queued()).toBe(1);
    s.flush();
    expect(s.events).toHaveLength(1);
    expect(s.events[0]?.target).toEqual({ kind: "node", node: nodeId("b") });
  });

  it("leaving the view raises the leave form", () => {
    const s = setup();
    s.tracker.move(...ON_A);
    s.flush();
    s.tracker.leave();
    s.flush();
    expect(s.events.map((e) => e.target?.kind ?? null)).toEqual(["node", null]);
  });

  it("a gesture raises nothing; at its end one event for the entity under the pointer", () => {
    const s = setup();
    s.tracker.move(...ON_A);
    s.flush();
    s.setGesture(true);
    for (const at of [ON_B, EMPTY, ON_B]) {
      s.tracker.move(...at);
      s.flush();
    }
    expect(s.events).toHaveLength(1);
    expect(s.tracker.current()).toEqual({ kind: "node", node: nodeId("a") });
    s.setGesture(false);
    s.tracker.gestureEnded();
    s.flush();
    expect(s.events).toHaveLength(2);
    expect(s.events[1]?.target).toEqual({ kind: "node", node: nodeId("b") });
  });

  it("a port wins over its node, and a connection is reported by ID", () => {
    const s = setup();
    const aR = s.h.scene
      .node(nodeId("a"))
      ?.anchors.find((p) => p.portId === portId("aR"))?.position;
    s.tracker.move(aR?.x ?? 0, aR?.y ?? 0);
    s.flush();
    expect(s.events[0]?.target).toEqual({
      kind: "port",
      node: nodeId("a"),
      port: portId("aR"),
    });
    s.tracker.move(70, 10);
    s.flush();
    expect(s.events[1]?.target).toMatchObject({ kind: "connection" });
  });

  it("ports hidden when zoomed out: the target is the node, not the port", () => {
    const s = setup({ hidePortsBelow: 0.5, zoom: 0.25 });
    const aR = s.h.scene
      .node(nodeId("a"))
      ?.anchors.find((p) => p.portId === portId("aR"))?.position;
    // At zoom 0.25 the client position of a world point is a quarter of it.
    s.tracker.move((aR?.x ?? 0) * 0.25 - 1, (aR?.y ?? 0) * 0.25);
    s.flush();
    expect(s.events[0]?.target).toEqual({ kind: "node", node: nodeId("a") });
  });

  it("a removed hovered entity clears the state and raises a leave at once", () => {
    const s = setup();
    s.tracker.move(...ON_A);
    s.flush();
    s.tracker.entitiesRemoved(["zzz"]);
    expect(s.events).toHaveLength(1);
    s.tracker.entitiesRemoved(["a"]);
    expect(s.tracker.current()).toBeNull();
    expect(s.events[1]).toEqual({ target: null });
  });

  it("a model reset clears the hover; dispose cancels the pending frame", () => {
    const s = setup();
    s.tracker.move(...ON_A);
    s.flush();
    s.tracker.modelReset();
    expect(s.events[1]).toEqual({ target: null });
    s.tracker.dispose();
    s.tracker.move(...ON_B);
    s.flush();
    expect(s.events).toHaveLength(2);
  });
});
