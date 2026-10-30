/// <reference types="@vitest/browser-playwright" />
import { describe, expect, it } from "vitest";
import { nodeId } from "../../../core/index.js";
import {
  buildModel,
  twoPortNode,
} from "../../../core/space/scene/scene-fixtures.js";
import {
  cleanupScope,
  frames,
  makeHost,
  pixelAt,
} from "../../browser-support.js";
import { mouse } from "../../interact/input/input-test-support.js";
import { mountView } from "../../mount-view.js";
import { createPainterRegistries } from "../registries/painters.js";
import { DEFAULT_THEME, type ThemeInput } from "../theme/tokens.js";

const cleanup = cleanupScope();

function hex(color: string): [number, number, number] {
  const n = Number.parseInt(color.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Node `a` is 200 x 100 at the origin; its right port anchor is at world (100, 0). */
async function mount(theme: ThemeInput = {}) {
  const model = buildModel([
    twoPortNode("a", 0, 0, { w: 200, h: 100 }),
    twoPortNode("b", 600, 0, { w: 200, h: 100 }),
  ]);
  const painters = createPainterRegistries();
  // Bodies paint nothing, so the anchor pixel is either the port glyph or background.
  painters.nodes.replace("t", { paint: () => {} });
  const view = mountView(makeHost(400, 300), {
    model,
    painters,
    theme,
    initialViewport: { zoom: 0.2, panX: 100, panY: 150 },
  });
  cleanup(() => view.dispose());
  await frames();
  // World (100, 0) in canvas CSS pixels, and as a client position for `pick`.
  const anchor = { x: 100 + 100 * 0.2, y: 150 };
  const box = view.element.getBoundingClientRect();
  const client = { x: box.left + anchor.x, y: box.top + anchor.y };
  return { model, view, scene: view.canvases.scene, anchor, client };
}

describe("ports hidden when zoomed out", () => {
  it("ports hidden when zoomed out: no glyph at the anchor, and a press there moves the node", async () => {
    const { model, view, scene, anchor, client } = await mount();
    // The scene canvas is transparent where nothing was drawn.
    expect(pixelAt(scene, anchor.x, anchor.y)[3]).toBe(0);
    expect(view.pick(client.x, client.y).map((h) => h.kind)).toEqual(["node"]);

    // A drag from the anchor, just inside the body, moves the node and connects nothing.
    mouse(view).drag([99, 0], [99, 200]);
    await frames();
    expect(model.reader.connections()).toHaveLength(0);
    expect(model.reader.getNode(nodeId("a"))?.position).toEqual({
      x: 0,
      y: 200,
    });
  });

  it("a threshold of 0 keeps the port glyph and its pick", async () => {
    const { view, scene, anchor, client } = await mount({
      lodHidePortsBelow: 0,
    });
    expect(pixelAt(scene, anchor.x, anchor.y).slice(0, 3)).toEqual(
      hex(DEFAULT_THEME.portFill),
    );
    expect(view.pick(client.x, client.y)[0]?.kind).toBe("port");
  });
});
