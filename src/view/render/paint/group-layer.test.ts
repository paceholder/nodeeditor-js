/** Group frame painting, headless: a recording context over a real geometry scene. */
import { describe, expect, it } from "vitest";
import {
  createGeometryScene,
  type GroupId,
  type NodeId,
  nodeId,
} from "../../../core/index.js";
import {
  buildModel,
  twoPortNode,
} from "../../../core/space/scene/scene-fixtures.js";
import { fakeContext, testFrame } from "../../test-support.js";
import { createAssetService } from "../assets/asset-service.js";
import { createGroupFramePainter } from "../presets/group-frame-painter.js";
import type {
  GroupFramePainter,
  GroupFramePaintInput,
} from "../registries/painter-types.js";
import { createPainterRegistries } from "../registries/painters.js";
import { DEFAULT_THEME, mergeTheme } from "../theme/tokens.js";
import { paintGroupFrames } from "./group-layer.js";
import {
  DEFAULT_Z_ORDER,
  EMPTY_VIEW_STATE,
  paintScene,
  type ViewState,
} from "./scene-layer.js";

const a = nodeId("a");
const b = nodeId("b");

function setup(state: ViewState = EMPTY_VIEW_STATE) {
  const model = buildModel([
    twoPortNode("a", 0, 0),
    twoPortNode("b", 100, 40),
    twoPortNode("far", 5000, 5000),
  ]);
  const scene = createGeometryScene(model);
  const painters = createPainterRegistries();
  const faults: unknown[] = [];
  const deps = {
    reader: model.reader,
    scene,
    painters,
    zOrder: DEFAULT_Z_ORDER,
    state,
    assets: createAssetService(),
    fault: (e: unknown) => faults.push(e),
  };
  const group = (nodes: readonly NodeId[], style?: string): GroupId => {
    const made = model.groupNodes(nodes, style === undefined ? {} : { style });
    if (made.status !== "accepted") throw new Error("group failed");
    return made.changed.groups[0] as GroupId;
  };
  return { model, scene, painters, deps, faults, group };
}

/** A painter that records what it is given. */
function recorder() {
  const inputs: GroupFramePaintInput[] = [];
  const painter: GroupFramePainter = { paint: (_ctx, i) => inputs.push(i) };
  return { painter, inputs };
}

/** A recording context that can measure text, as the default painter needs. */
function measuringContext() {
  const fake = fakeContext();
  (fake.ctx as unknown as Record<string, unknown>).measureText = (
    text: string,
  ) => ({ width: text.length * 7 });
  return fake;
}

describe("group frame painter", () => {
  it("is its own registration: a host painter replaces the default and node painting is unchanged", () => {
    const { painters, deps, group } = setup();
    const id = group([a, b]);
    const { painter, inputs } = recorder();
    const nodePainter = painters.nodes.get("t");
    let notified = 0;
    painters.group.onChange(() => notified++);
    painters.group.set(painter);
    expect(notified).toBe(1);
    expect(painters.nodes.get("t")).toBe(nodePainter);
    const stats = paintScene(fakeContext().ctx, deps, testFrame());
    expect(inputs.map((i) => i.group.id)).toEqual([id]);
    expect(stats).toMatchObject({ nodes: 2, groups: 1 });
  });

  it("paints frames before connections and nodes, so they lie beneath them", () => {
    const { painters, deps, group } = setup();
    group([a, b]);
    const order: string[] = [];
    painters.group.set({ paint: () => order.push("group") });
    painters.nodes.replace("t", { paint: () => order.push("node") });
    paintScene(fakeContext().ctx, deps, testFrame());
    expect(order).toEqual(["group", "node", "node"]);
  });

  it("does not call the painter for a frame outside the visible area (culled painting)", () => {
    const { painters, deps, group } = setup();
    group([nodeId("far")]);
    const { painter, inputs } = recorder();
    painters.group.set(painter);
    const stats = paintScene(fakeContext().ctx, deps, testFrame());
    expect(inputs).toEqual([]);
    expect(stats.groups).toBe(0);
  });

  it("passes the frame, title strip, a lock box of constant screen size, and the states", () => {
    const selected = { ...EMPTY_VIEW_STATE, isSelected: () => true };
    const { painters, deps, scene, group } = setup(selected);
    const id = group([a, b]);
    const { painter, inputs } = recorder();
    painters.group.set(painter);
    for (const zoom of [0.5, 2]) {
      paintScene(
        fakeContext().ctx,
        deps,
        testFrame({ zoom, panX: 0, panY: 0 }),
      );
      const input = inputs.at(-1);
      expect(input?.frame).toEqual(scene.group(id)?.frame);
      expect(input?.titleStrip).toEqual(scene.group(id)?.titleStrip);
      expect((input?.lockBox.w ?? 0) * zoom).toBeCloseTo(16);
      expect(input?.state).toEqual({
        selected: true,
        hovered: false,
        joinTarget: false,
        unconfirmed: false,
      });
    }
  });

  it("a style key selects a named style, and an unknown key falls back to the default without an error", () => {
    const { painters, deps, faults, group } = setup();
    group([a], "note");
    group([b], "missing");
    const { painter, inputs } = recorder();
    painters.group.set(painter);
    const theme = mergeTheme(DEFAULT_THEME, {
      groupStyles: { note: { groupFill: "yellow" } },
    });
    paintScene(
      fakeContext().ctx,
      deps,
      testFrame({ zoom: 1, panX: 400, panY: 300 }, theme),
    );
    expect(inputs.map((i) => i.style.groupFill)).toEqual([
      "yellow",
      DEFAULT_THEME.groupFill,
    ]);
    expect(inputs[0]?.style.groupStroke).toBe(DEFAULT_THEME.groupStroke);
    expect(faults).toEqual([]);
  });

  it("a painter that throws is contained and reported, and the other frames and nodes still paint", () => {
    const { painters, deps, faults, group } = setup();
    group([a]);
    group([b]);
    let calls = 0;
    painters.group.set({
      paint() {
        calls++;
        if (calls === 1) throw new Error("boom");
      },
    });
    const fake = fakeContext();
    const stats = paintScene(
      fake.ctx,
      deps,
      testFrame({ zoom: 1, panX: 400, panY: 300 }),
    );
    expect(calls).toBe(2);
    expect(faults).toHaveLength(1);
    expect(stats.nodes).toBe(2);
    const saves = fake.calls.filter((c) => c === "save").length;
    expect(fake.calls.filter((c) => c === "restore").length).toBe(saves);
  });

  it("skips a frame the view state hides (a drag preview draws it instead)", () => {
    const { painters, deps, group } = setup();
    const id = group([a, b]);
    const { painter, inputs } = recorder();
    painters.group.set(painter);
    paintScene(
      fakeContext().ctx,
      { ...deps, state: { ...EMPTY_VIEW_STATE, isHidden: (x) => x === id } },
      testFrame(),
    );
    expect(inputs).toEqual([]);
  });
});

describe("default group frame painter: states differ by more than color", () => {
  const paint = (
    over: Partial<GroupFramePaintInput["state"]>,
    locked = false,
    zoom = 1,
  ) => {
    const { scene, group, model } = setup();
    const id = group([a, b]);
    if (locked) model.setGroupLocked(id, true);
    const entry = scene.group(id);
    if (!entry) throw new Error("no frame");
    const fake = measuringContext();
    paintGroupFrames(
      fake.ctx,
      {
        painter: createGroupFramePainter(),
        metrics: scene.groupMetrics,
        state: {
          isSelected: () => over.selected === true,
          isHovered: () => false,
        },
      },
      testFrame({ zoom, panX: 0, panY: 0 }),
      [{ ...entry, joinTarget: over.joinTarget === true }],
    );
    return fake.calls;
  };
  const count = (calls: string[], name: string) =>
    calls.filter((c) => c === name).length;

  it("an idle frame has a dashed border and a selected frame a solid, thicker one", () => {
    const idle = paint({});
    const selected = paint({ selected: true });
    // Idle sets a dash pattern and clears it; selected only clears.
    expect(count(idle, "setLineDash")).toBe(2);
    expect(count(selected, "setLineDash")).toBe(1);
    expect(idle).toContain("lineWidth=1");
    expect(selected).toContain(`lineWidth=${DEFAULT_THEME.selectionWidth}`);
  });

  it("a group about to gain a node gets a second, inner border", () => {
    const idle = paint({});
    const joining = paint({ joinTarget: true });
    expect(count(joining, "roundRect")).toBe(count(idle, "roundRect") + 1);
    expect(joining).toContain(`strokeStyle=${DEFAULT_THEME.groupJoin}`);
  });

  it("a locked group draws a closed, filled padlock and an unlocked one an open shackle", () => {
    const open = paint({}, false);
    const closed = paint({}, true);
    // The closed padlock fills its body; the open one adds the free end of the shackle.
    expect(count(closed, "fill")).toBe(count(open, "fill") + 1);
    expect(count(open, "lineTo")).toBe(count(closed, "lineTo") + 1);
  });

  it("draws the title, and at the overview level neither title nor padlock", () => {
    const full = paint({});
    expect(count(full, "fillText")).toBe(1);
    expect(count(full, "arc")).toBe(1);
    const overview = paint({}, false, DEFAULT_THEME.lodOverviewBelow / 2);
    expect(count(overview, "fillText")).toBe(0);
    expect(count(overview, "arc")).toBe(0);
    expect(count(overview, "roundRect")).toBe(1);
  });
});
