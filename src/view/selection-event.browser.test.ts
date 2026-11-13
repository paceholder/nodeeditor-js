/// <reference types="@vitest/browser-playwright" />
import { describe, expect, it } from "vitest";
import { buildModel, twoPortNode } from "../core/space/scene/scene-fixtures.js";
import { cleanupScope, frames, makeHost, selNode } from "./browser-support.js";
import type { SelectionState } from "./interact/selection/view-selection.js";
import { mountView } from "./mount-view.js";

const cleanup = cleanupScope();

function setup() {
  const model = buildModel([
    twoPortNode("a", 100, 100),
    twoPortNode("b", 300, 100),
  ]);
  const view = mountView(makeHost(480, 300), { model });
  cleanup(() => view.dispose());
  return view;
}

describe("view events", () => {
  it("selection changes arrive through view.on, with the node and connection IDs and the primary", async () => {
    const view = setup();
    await frames();
    const seen: SelectionState[] = [];
    view.on("selection", (e) => seen.push(e));
    view.selection.replace([selNode("a")]);
    view.selection.add([selNode("b")]);
    expect(seen).toEqual([
      {
        nodes: [selNode("a").id],
        connections: [],
        groups: [],
        primary: selNode("a"),
      },
      {
        nodes: [selNode("a").id, selNode("b").id],
        connections: [],
        groups: [],
        primary: selNode("b"),
      },
    ]);
  });

  it("an unchanged selection raises nothing and the unsubscribe stops events", async () => {
    const view = setup();
    await frames();
    let calls = 0;
    const off = view.on("selection", () => calls++);
    view.selection.replace([selNode("a")]);
    view.selection.replace([selNode("a")]);
    expect(calls).toBe(1);
    off();
    view.selection.clear();
    expect(calls).toBe(1);
  });

  it("the old per-namespace subscriptions are gone", async () => {
    const view = setup();
    expect("on" in view.selection).toBe(false);
    expect("on" in view.viewport).toBe(false);
  });
});
