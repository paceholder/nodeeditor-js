import { describe, expect, it } from "vitest";
import { connectionId, nodeId } from "../../../core/index.js";
import { createSelectionModel } from "./selection-model.js";
import { createViewSelection, type SelectedEntity } from "./view-selection.js";

const node = (id: string): SelectedEntity => ({ kind: "node", id: nodeId(id) });
const conn = (id: string): SelectedEntity => ({
  kind: "connection",
  id: connectionId(id),
});

function setup() {
  const model = createSelectionModel();
  return { model, selection: createViewSelection(model) };
}

describe("the host's view of the selection names entities, never keys", () => {
  it("replace, add, toggle and clear take entities and report whether the selection differs", () => {
    const { selection } = setup();
    expect(selection.replace([node("a")])).toBe(true);
    expect(selection.replace([node("a")])).toBe(false);
    expect(selection.add([node("b"), conn("c1")])).toBe(true);
    expect(selection.toggle([node("a")])).toBe(true);
    expect(selection.nodes()).toEqual([nodeId("b")]);
    expect(selection.connections()).toEqual([connectionId("c1")]);
    expect(selection.size).toBe(2);
    expect(selection.clear()).toBe(true);
    expect(selection.clear()).toBe(false);
    expect(selection.size).toBe(0);
  });

  it("state() is the whole selection with the primary as an entity", () => {
    const { selection } = setup();
    expect(selection.state()).toEqual({
      nodes: [],
      connections: [],
      primary: undefined,
    });
    selection.replace([node("a")]);
    selection.add([conn("c1")]);
    expect(selection.state()).toEqual({
      nodes: [nodeId("a")],
      connections: [connectionId("c1")],
      primary: conn("c1"),
    });
    expect(selection.primary()).toEqual(conn("c1"));
  });

  it("has and isSelected tell nodes and connections apart", () => {
    const { selection } = setup();
    selection.replace([node("a"), conn("c1")]);
    expect(selection.has(node("a"))).toBe(true);
    expect(selection.has(conn("a"))).toBe(false);
    expect(selection.isSelected("c1")).toBe(true);
    expect(selection.isSelected("zzz")).toBe(false);
  });

  it("the facade is a view of the model: a change made through the model shows", () => {
    const { model, selection } = setup();
    model.replace(["n:x"]);
    expect(selection.nodes()).toEqual([nodeId("x")]);
  });
});
