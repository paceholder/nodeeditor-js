/// <reference types="@vitest/browser-playwright" />
import { describe, expect, it } from "vitest";
import {
  createGeometryScene,
  createGraphModel,
  type GraphModel,
  type NodeId,
} from "../core/index.js";
import { cleanupScope, frames, makeHost, pixelAt } from "./browser-support.js";
import { mouse } from "./interact/input/input-test-support.js";
import { mountView } from "./mount-view.js";

const cleanup = cleanupScope();

/** A `tank` type that opted in to resizing and a `plain` type that did not. */
function makeModel(): { model: GraphModel; tank: NodeId; plain: NodeId } {
  const model = createGraphModel();
  model.registry.register({
    type: "tank",
    label: "Tank",
    defaultSize: { width: 100, height: 60 },
    capabilities: { resize: true },
    sizeLimits: { min: { width: 20, height: 20 } },
  });
  model.registry.register({
    type: "plain",
    label: "Plain",
    defaultSize: { width: 100, height: 60 },
  });
  model.createNode("tank", { x: 200, y: 150 });
  model.createNode("plain", { x: 450, y: 150 });
  const [tank, plain] = model.reader.nodes().map((n) => n.id);
  if (!tank || !plain) throw new Error("nodes missing");
  return { model, tank, plain };
}

/** Count live model subscriptions, to check that dispose releases every one. */
function countListeners(model: GraphModel) {
  let live = 0;
  const on = model.on;
  const counted: GraphModel = {
    ...model,
    on: ((type, handler) => {
      live++;
      const off = on(type, handler);
      return () => {
        live--;
        off();
      };
    }) as GraphModel["on"],
  };
  return { counted, live: () => live };
}

async function setup() {
  const { model, tank, plain } = makeModel();
  const listeners = countListeners(model);
  const view = mountView(makeHost(700, 400), {
    model: listeners.counted,
    input: { platform: "other" },
  });
  cleanup(() => view.dispose());
  const scene = createGeometryScene(model);
  cleanup(() => scene.dispose());
  await frames(3);
  const select = async (id: NodeId) => {
    view.selection.replace([`n:${id}`]);
    await frames(2);
  };
  const handleAlpha = (x: number, y: number) =>
    pixelAt(view.canvases.interaction, x, y)[3];
  return { model, tank, plain, view, scene, select, handleAlpha, listeners };
}

describe("resize in the browser", () => {
  it("the corner drag resizes with the top-left fixed in one history entry", async () => {
    const { model, tank, view, select, handleAlpha } = await setup();
    expect(handleAlpha(246, 176)).toBe(0);
    await select(tank);
    // Body 150..250 x 120..180; the 8 px handle is inside its bottom-right corner.
    expect(handleAlpha(246, 176)).toBeGreaterThan(0);
    const changes: number[] = [];
    model.on("change", (e) => changes.push(e.patch.ops.length));
    mouse(view).drag([246, 176], [286, 196]);
    expect(changes).toEqual([1]);
    expect(model.historyState().undoLabel).toBe("Resize");
    expect(model.reader.getNode(tank)).toMatchObject({
      size: { width: 140, height: 80 },
      position: { x: 220, y: 160 },
    });
    // The handle followed the new corner.
    await frames(2);
    expect(handleAlpha(286, 196)).toBeGreaterThan(0);
  });

  it("a quarter-turned mirrored node grows to the right and down from its screen bottom-right handle", async () => {
    const { model, tank, view, scene, select } = await setup();
    model.rotateNodes([tank], 1);
    model.mirrorNodes([tank]);
    const before = scene.node(tank)?.bodyBounds;
    if (!before) throw new Error("no entry");
    // On screen the body is 60 wide and 100 tall.
    expect([before.w, before.h]).toEqual([60, 100]);
    await select(tank);
    const right = before.x + before.w;
    const bottom = before.y + before.h;
    mouse(view).drag([right - 3, bottom - 3], [right + 27, bottom + 17]);
    const after = scene.node(tank)?.bodyBounds;
    expect(after).toEqual({
      x: before.x,
      y: before.y,
      w: before.w + 30,
      h: before.h + 20,
    });
  });

  it("a node of a type that did not opt in shows no handle and moves from its corner", async () => {
    const { model, plain, view, select, handleAlpha } = await setup();
    await select(plain);
    expect(handleAlpha(496, 176)).toBe(0);
    mouse(view).drag([496, 176], [516, 176]);
    expect(model.reader.getNode(plain)?.size).toEqual({
      width: 100,
      height: 60,
    });
    expect(model.historyState().undoLabel).toBe("Move");
  });

  it("no painter or model listener remains after dispose", async () => {
    const { tank, view, select, listeners } = await setup();
    await select(tank);
    expect(listeners.live()).toBeGreaterThan(0);
    view.dispose();
    expect(listeners.live()).toBe(0);
  });
});
