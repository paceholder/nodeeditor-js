import { describe, expect, it } from "vitest";
import { connectionId, createGraphModel, nodeId } from "../../../core/index.js";
import { graphOps } from "../../../core/space/scene/scene-fixtures.js";
import {
  applySelectionChange,
  connectionKey,
  createSelectionModel,
  nodeKey,
} from "./selection-model.js";

const a = nodeKey(nodeId("a"));
const b = nodeKey(nodeId("b"));
const c = nodeKey(nodeId("c"));

describe("selection model", () => {
  it("replace, add, toggle and clear", () => {
    const s = createSelectionModel();
    s.replace([a]);
    expect(s.keys()).toEqual([a]);
    s.add([b]);
    expect(s.keys()).toEqual([a, b]);
    s.toggle([a, c]);
    expect(s.keys()).toEqual([b, c]);
    expect(s.clear()).toBe(true);
    expect(s.clear()).toBe(false);
    expect(s.size).toBe(0);
    expect(s.primary()).toBeUndefined();
  });

  it("keeps a deterministic insertion order without duplicates", () => {
    const s = createSelectionModel();
    s.replace([c, a, c]);
    s.add([b, a]);
    expect(s.keys()).toEqual([c, a, b]);
    expect(s.primary()).toBe(a);
    expect(applySelectionChange([a], { mode: "add", keys: [b, a] })).toEqual([
      a,
      b,
    ]);
  });

  it("reports changes only when the selection differs", () => {
    const s = createSelectionModel();
    const seen: number[] = [];
    const off = s.on((e) => seen.push(e.keys.length));
    s.replace([a, b]);
    s.replace([a, b]);
    s.add([]);
    off();
    s.clear();
    expect(seen).toEqual([2]);
  });

  it("two selections are independent", () => {
    const one = createSelectionModel();
    const two = createSelectionModel();
    one.replace([a]);
    two.replace([b]);
    expect(one.keys()).toEqual([a]);
    expect(two.keys()).toEqual([b]);
    expect(one.isSelected("a")).toBe(true);
    expect(two.isSelected("a")).toBe(false);
  });

  it("drops entities removed from the model, keeps the rest", () => {
    const model = createGraphModel();
    model.submit({
      ops: graphOps(
        [
          { id: "a", x: 0, y: 0, ports: [{ id: "ap" }] },
          { id: "b", x: 100, y: 0, ports: [{ id: "bp" }] },
        ],
        [["c1", "a", "ap", "b", "bp"]],
      ),
    });
    const s = createSelectionModel();
    s.bindToModel(model);
    s.replace([a, b, connectionKey(connectionId("c1"))]);
    expect(model.deleteEntities({ nodes: [nodeId("a")] }).status).toBe(
      "accepted",
    );
    // Deleting a node removes its incident connection too.
    expect(s.keys()).toEqual([b]);
    s.dispose();
    s.replace([a]);
    model.deleteEntities({ nodes: [nodeId("b")] });
    expect(s.keys()).toEqual([a]);
  });
});
