import { describe, expect, it } from "vitest";
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
import { mountView } from "../../mount-view.js";
import { createPainterRegistries } from "../registries/painters.js";

const cleanup = cleanupScope();

function setup() {
  const model = buildModel([twoPortNode("a", 50, 50)]);
  const counts = { background: 0, scene: 0, interaction: 0 };
  const painters = createPainterRegistries();
  painters.nodes.replace("t", { paint: () => void counts.scene++ });
  painters.background.set(() => void counts.background++);
  const view = mountView(makeHost(300, 200), {
    model,
    painters,
  });
  cleanup(() => view.dispose());
  return { view, counts };
}

describe("interaction layer", () => {
  it("LAY-01 drag preview repaints only interaction layer", async () => {
    const { view, counts } = setup();
    let x = 10;
    view.interaction.add({
      paint(ctx) {
        counts.interaction++;
        ctx.fillStyle = "#ff00ff";
        ctx.fillRect(x, 20, 10, 10);
      },
    });
    await frames();
    counts.background = counts.scene = counts.interaction = 0;

    for (let i = 0; i < 3; i++) {
      x += 30;
      view.interaction.invalidate();
      view.interaction.invalidate(); // coalesced within the frame
      await frames(2);
    }
    expect(counts.interaction).toBe(3);
    expect(counts.background).toBe(0);
    expect(counts.scene).toBe(0);
    // The preview is on the interaction canvas, nothing else moved.
    expect(pixelAt(view.canvases.interaction, x + 5, 25)).toEqual([
      255, 0, 255, 255,
    ]);
    expect(pixelAt(view.canvases.interaction, x - 25, 25)[3]).toBe(0);
  });

  it("LAY-02 idle interaction layer requests no frames", async () => {
    const { view, counts } = setup();
    view.interaction.add({ paint: () => void counts.interaction++ });
    await frames();
    const seen = counts.interaction;
    await frames(5);
    expect(counts.interaction).toBe(seen);
  });

  it("LAY-01 painters run in order, lowest first, and removal repaints", async () => {
    const { view } = setup();
    const log: string[] = [];
    const offLate = view.interaction.add({
      order: 10,
      paint: () => void log.push("late"),
    });
    view.interaction.add({ paint: () => void log.push("first") });
    view.interaction.add({ paint: () => void log.push("second") });
    view.interaction.add({ order: -5, paint: () => void log.push("early") });
    await frames();
    expect(log).toEqual(["early", "first", "second", "late"]);
    log.length = 0;
    offLate();
    await frames();
    expect(log).toEqual(["early", "first", "second"]);
  });
});
