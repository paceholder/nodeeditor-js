import { describe, expect, it } from "vitest";
import { nodeId } from "../core/index.js";
import { buildModel, twoPortNode } from "../core/space/scene/scene-fixtures.js";
import type { ViewHandle } from "../view/index.js";
import { createEditorStore } from "./editor-store.js";

const view = {} as ViewHandle;
const model = () => buildModel([twoPortNode("a", 0, 0)]);

describe("entity dispatcher lifetime", () => {
  it("reading the dispatcher has no side effect and keeps one per model", () => {
    const store = createEditorStore();
    expect(store.entities()).toBeUndefined();
    const m = model();
    store.set({ view, model: m });
    const first = store.entities();
    expect(first).toBeDefined();
    expect(store.entities()).toBe(first);
    expect(store.entities()).toBe(first);
    store.set({ view: null, model: m });
    expect(store.entities()).toBe(first);
  });

  it("a new model disposes the old dispatcher when it is set, not when it is read", () => {
    const store = createEditorStore();
    const a = model();
    store.set({ view, model: a });
    let wakes = 0;
    store.entities()?.subscribe("node", "a", () => wakes++);

    store.set({ view, model: model() });
    expect(store.entities()).toBeDefined();
    // The old dispatcher stopped listening to its model.
    a.deleteEntities({ nodes: [nodeId("a")] });
    expect(wakes).toBe(0);

    store.set({ view: null, model: undefined });
    expect(store.entities()).toBeUndefined();
  });

  it("a remount that keeps the model keeps the dispatcher and its subscribers", () => {
    const store = createEditorStore();
    const m = model();
    store.set({ view, model: m });
    const first = store.entities();
    let wakes = 0;
    first?.subscribe("node", "a", () => wakes++);

    // A remount clears the slot, then sets it again with the same model.
    store.set({ view: null, model: undefined });
    expect(store.entities()).toBeUndefined();
    store.set({ view: {} as ViewHandle, model: m });
    expect(store.entities()).toBe(first);
    m.deleteEntities({ nodes: [nodeId("a")] });
    expect(wakes).toBe(1);
  });

  it("the current dispatcher wakes a subscriber for a change in its node", () => {
    const store = createEditorStore();
    const m = model();
    store.set({ view, model: m });
    let wakes = 0;
    store.entities()?.subscribe("node", "a", () => wakes++);
    m.deleteEntities({ nodes: [nodeId("a")] });
    expect(wakes).toBe(1);
  });
});
