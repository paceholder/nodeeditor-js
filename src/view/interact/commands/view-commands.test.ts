import { describe, expect, it } from "vitest";
import { nodeId, type Viewport } from "../../../core/index.js";
import type { NodeSpec } from "../../../core/space/scene/scene-fixtures.js";
import {
  cornerNode,
  createToolHarness,
} from "../../test-support/tool-harness.js";
import { nodeKey } from "../selection/selection-model.js";
import { createViewCommands } from "./view-commands.js";

const SIZE = { width: 800, height: 600 };

function setup(
  nodes?: readonly NodeSpec[],
  initial: Viewport = { zoom: 1, panX: 0, panY: 0 },
) {
  const h = createToolHarness(nodes ? { nodes } : {});
  let vp = initial;
  const commands = createViewCommands({
    reader: h.model.reader,
    scene: h.scene,
    selection: h.selection,
    viewport: {
      get: () => vp,
      set: (v) => {
        vp = v;
        return { ok: true, value: v };
      },
    },
    size: () => SIZE,
  });
  return { h, commands, vp: () => vp };
}

function visible(
  h: ReturnType<typeof setup>["h"],
  vp: Viewport,
  id: string,
): boolean {
  const b = h.scene.node(nodeId(id))?.paintedBounds;
  if (!b) return false;
  const x0 = b.x * vp.zoom + vp.panX;
  const y0 = b.y * vp.zoom + vp.panY;
  return (
    x0 >= 0 &&
    y0 >= 0 &&
    x0 + b.w * vp.zoom <= SIZE.width &&
    y0 + b.h * vp.zoom <= SIZE.height
  );
}

describe("view commands", () => {
  it("fit on an empty graph is a no-op", () => {
    const { commands, vp } = setup(undefined, {
      zoom: 2,
      panX: 5,
      panY: 6,
    });
    expect(commands.fitAll()).toEqual({ ok: true, value: { changed: false } });
    expect(commands.fitSelection()).toEqual({
      ok: true,
      value: { changed: false },
    });
    expect(vp()).toEqual({ zoom: 2, panX: 5, panY: 6 });
  });

  it("fitAll shows every node; fitSelection shows only the selection", () => {
    const { h, commands, vp } = setup([
      cornerNode("a", -2000, -1500),
      cornerNode("b", 3000, 2000),
    ]);
    expect(commands.fitAll()).toEqual({ ok: true, value: { changed: true } });
    expect(visible(h, vp(), "a") && visible(h, vp(), "b")).toBe(true);
    expect(vp().zoom).toBeLessThan(1);
    h.selection.replace([nodeKey(nodeId("b"))]);
    commands.fitSelection();
    expect(visible(h, vp(), "b")).toBe(true);
    expect(vp().zoom).toBeLessThanOrEqual(2);
    // Fitting again changes nothing.
    expect(commands.fitSelection()).toEqual({
      ok: true,
      value: { changed: false },
    });
  });

  it("resetView returns to zoom 1 at the origin", () => {
    const { commands, vp } = setup([cornerNode("a", 0, 0)], {
      zoom: 3,
      panX: 40,
      panY: -9,
    });
    expect(commands.resetView().ok).toBe(true);
    expect(vp()).toEqual({ zoom: 1, panX: 0, panY: 0 });
    expect(commands.resetView()).toEqual({
      ok: true,
      value: { changed: false },
    });
  });

  it("reveal of an off-screen node makes it fully visible", () => {
    const { h, commands, vp } = setup([
      cornerNode("a", 100, 100),
      cornerNode("far", 5000, 4000),
    ]);
    expect(visible(h, vp(), "far")).toBe(false);
    expect(commands.reveal(nodeId("far"))).toEqual({
      ok: true,
      value: { changed: true },
    });
    expect(visible(h, vp(), "far")).toBe(true);
    // Pan only: zoom is unchanged when the node fits.
    expect(vp().zoom).toBe(1);
    // Already visible: nothing to do.
    expect(commands.reveal(nodeId("far"))).toEqual({
      ok: true,
      value: { changed: false },
    });
  });

  it("reveal zooms out when the entity does not fit, and rejects unknown IDs", () => {
    const { h, commands, vp } = setup([
      { id: "big", x: 0, y: 3000, w: 4000, h: 2000, ports: [] },
    ]);
    commands.reveal(nodeId("big"));
    expect(vp().zoom).toBeLessThan(1);
    expect(visible(h, vp(), "big")).toBe(true);
    const missing = commands.reveal(nodeId("ghost"));
    expect(missing.ok).toBe(false);
  });
});
