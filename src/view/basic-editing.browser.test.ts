/// <reference types="@vitest/browser-playwright" />
import { describe, expect, it } from "vitest";
import {
  createCardGeometry,
  createGeometryRegistry,
  createGeometryScene,
  createGraphModel,
  createImageSymbolGeometry,
  type NodeRecord,
} from "../core/index.js";
import {
  cleanupScope,
  frames,
  makeHost,
  solidSvg,
  until,
} from "./browser-support.js";
import { key, mouse, wheel } from "./interact/input/input-test-support.js";
import { mountView } from "./mount-view.js";
import { createCardPainter } from "./render/presets/card-painter.js";
import { createImageSymbolPainter } from "./render/presets/image-symbol-painter.js";
import { createPortGlyphPainter } from "./render/presets/port-glyph-painter.js";
import { createPainterRegistries } from "./render/registries/painters.js";

const cleanup = cleanupScope();

/** The local editor use case and the simple connection use case: a small physical-system schematic edited end to end. */
async function setup() {
  const model = createGraphModel();
  const left = { x: 0, y: 0.5 };
  const right = { x: 1, y: 0.5 };
  for (const [type, size] of [
    ["pump", { width: 80, height: 80 }],
    ["valve", { width: 80, height: 50 }],
  ] as const) {
    model.registry.register({
      type,
      label: type,
      defaultSize: size,
      ports: () => [
        { direction: "input", placement: left, typeKey: "pipe" },
        { direction: "output", placement: right, typeKey: "pipe" },
      ],
    });
  }
  model.registry.register({
    type: "controller",
    label: "Controller",
    defaultSize: { width: 150, height: 110 },
    ports: () => [{ direction: "input", typeKey: "pipe", label: "feed" }],
  });
  model.createNode(
    "pump",
    { x: 200, y: 150 },
    { title: "Pump", payload: { asset: "sym" } },
  );
  model.createNode(
    "valve",
    { x: 400, y: 150 },
    { title: "Valve", payload: { asset: "sym" } },
  );
  model.createNode("controller", { x: 640, y: 150 }, { title: "Controller" });
  const byTitle = (t: string): NodeRecord => {
    const n = model.reader.nodes().find((x) => x.title === t);
    if (!n) throw new Error(t);
    return n;
  };

  const geometry = createGeometryRegistry();
  geometry.register("pump", createImageSymbolGeometry());
  geometry.register("valve", createImageSymbolGeometry());
  geometry.register("controller", createCardGeometry());
  const painters = createPainterRegistries();
  painters.nodes.register("pump", createImageSymbolPainter());
  painters.nodes.register("valve", createImageSymbolPainter());
  painters.nodes.register("controller", createCardPainter());
  painters.portGlyphs.replace("pipe", createPortGlyphPainter());
  const view = mountView(makeHost(800, 500), {
    model,
    geometry,
    painters,
    assets: {
      resolve: async () => ({ kind: "svg", text: solidSvg(10, 10, "#4a90d9") }),
    },
    input: { platform: "other" },
  });
  cleanup(() => view.dispose());
  const scene = createGeometryScene(model, { registry: geometry });
  cleanup(() => scene.dispose());
  const anchor = (title: string, direction: "input" | "output") => {
    const n = byTitle(title);
    const port = model.reader
      .portsOf(n.id)
      .find((p) => p.direction === direction);
    const a = scene.node(n.id)?.anchors.find((x) => x.portId === port?.id);
    if (!a) throw new Error(`${title} ${direction}`);
    return [a.position.x, a.position.y] as const;
  };
  await until(() => view.assets.stats().rasterizations >= 1);
  await frames(3);
  return { model, view, byTitle, anchor, pointer: mouse(view) };
}

describe("basic editing", () => {
  it("pan, zoom, Shift-marquee, move two nodes, connect, undo and redo: one history entry per gesture", async () => {
    const { model, view, byTitle, anchor, pointer } = await setup();
    const changes: Array<{ origin: string; ops: number }> = [];
    model.on("change", (e) =>
      changes.push({ origin: e.origin, ops: e.patch.ops.length }),
    );
    const revision = model.reader.revision();
    const pos = (t: string) => model.reader.getNode(byTitle(t).id)?.position;

    // Pan (middle button) and wheel zoom are view state: the model sees nothing.
    pointer.down(300, 400, {}, 1);
    pointer.move(340, 420, {});
    pointer.up(340, 420, {}, 1);
    expect(view.viewport.get()).toMatchObject({ panX: 40, panY: 20 });
    expect(wheel(view, 100, 100, -300).defaultPrevented).toBe(true);
    expect(view.viewport.get().zoom).toBeGreaterThan(1);
    expect(model.reader.revision()).toBe(revision);
    expect(view.commands.run("view.resetView").ok).toBe(true);
    expect(view.viewport.get()).toEqual({ zoom: 1, panX: 0, panY: 0 });

    // A plain drag on empty canvas pans too (emptyDrag: "pan" is the default). The
    // helper takes world points, so one move keeps the screen delta exact.
    pointer.down(600, 450);
    pointer.move(570, 440);
    pointer.up(600, 450);
    expect(view.viewport.get()).toEqual({ zoom: 1, panX: -30, panY: -10 });
    expect(model.reader.revision()).toBe(revision);
    expect(view.commands.run("view.resetView").ok).toBe(true);

    // Shift-marquee left to right selects the pump and the valve, not the controller.
    pointer.drag([120, 60], [480, 240], { shift: true });
    expect(view.selection.keys()).toHaveLength(2);
    expect(view.selection.has(`n:${byTitle("Pump").id}`)).toBe(true);
    expect(view.selection.has(`n:${byTitle("Valve").id}`)).toBe(true);
    expect(changes).toEqual([]);

    // Dragging one selected node moves both, as one change and one history entry.
    pointer.drag([200, 150], [200, 250], {}, 10);
    expect(changes).toHaveLength(1);
    expect(pos("Pump")).toEqual({ x: 200, y: 250 });
    expect(pos("Valve")).toEqual({ x: 400, y: 250 });
    expect(model.historyState().undoLabel).toMatch(/move/i);

    // Connect pump output to valve input: one more change.
    pointer.drag(anchor("Pump", "output"), anchor("Valve", "input"), {}, 8);
    expect(changes).toHaveLength(2);
    expect(model.reader.connections()).toHaveLength(1);
    expect(model.historyState().undoLabel).toBe("Connect");

    // Undo and redo from the keyboard, one gesture at a time.
    key(view.element, "z", { ctrl: true });
    expect(model.reader.connections()).toHaveLength(0);
    key(view.element, "z", { ctrl: true });
    expect(pos("Pump")).toEqual({ x: 200, y: 150 });
    key(view.element, "y", { ctrl: true });
    expect(pos("Pump")).toEqual({ x: 200, y: 250 });
    key(view.element, "Z", { ctrl: true, shift: true });
    expect(model.reader.connections()).toHaveLength(1);
    expect(changes.map((c) => c.origin)).toEqual([
      "local",
      "local",
      "undo",
      "undo",
      "redo",
      "redo",
    ]);
    // Nothing else reached the model: exactly the two gestures plus four history steps.
    expect(model.reader.revision()).toBe(revision + 6);
  });

  it("delete removes the selection and its connections in one entry", async () => {
    const { model, view, byTitle, anchor, pointer } = await setup();
    pointer.drag(anchor("Pump", "output"), anchor("Valve", "input"), {}, 8);
    expect(model.reader.connections()).toHaveLength(1);
    let changes = 0;
    model.on("change", () => changes++);
    pointer.down(200, 150);
    pointer.up(200, 150);
    expect(view.selection.keys()).toEqual([`n:${byTitle("Pump").id}`]);
    key(view.element, "Delete");
    expect(changes).toBe(1);
    expect(model.reader.nodes()).toHaveLength(2);
    expect(model.reader.connections()).toHaveLength(0);
    key(view.element, "z", { ctrl: true });
    expect(model.reader.nodes()).toHaveLength(3);
    expect(model.reader.connections()).toHaveLength(1);
  });

  it("grid snapping turns on and off at runtime", async () => {
    const { model, view, byTitle, pointer } = await setup();
    const pos = () => model.reader.getNode(byTitle("Pump").id)?.position;
    expect(view.toolOptions().gridStep).toBeUndefined();

    view.setToolOptions({ gridStep: 20 });
    pointer.drag([200, 150], [213, 157], {}, 6);
    expect(pos()).toEqual({ x: 220, y: 160 });

    view.setToolOptions({ gridStep: undefined });
    expect(view.toolOptions().gridStep).toBeUndefined();
    pointer.drag([225, 165], [231, 170], {}, 6);
    expect(pos()).toEqual({ x: 226, y: 165 });
  });

  it("setToolOptions with replace makes the patch the whole set of overrides", async () => {
    const { view } = await setup();
    const base = view.toolOptions().emptyDrag;
    view.setToolOptions({ gridStep: 20, emptyDrag: "marquee" });
    view.setToolOptions({ gridStep: 10 });
    expect(view.toolOptions()).toMatchObject({
      gridStep: 10,
      emptyDrag: "marquee",
    });
    view.setToolOptions({ gridStep: 5 }, { replace: true });
    expect(view.toolOptions().gridStep).toBe(5);
    expect(view.toolOptions().emptyDrag).toBe(base);
  });
});
