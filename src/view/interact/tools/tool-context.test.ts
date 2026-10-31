import { describe, expect, it } from "vitest";
import {
  createGeometryScene,
  createGraphModel,
  createNodeTypeRegistry,
  DEFAULT_SIZE_LIMITS,
  type NodeId,
} from "../../../core/index.js";
import { createSelectionModel } from "../selection/selection-model.js";
import { capabilityProbe, createToolContext } from "./tool-context.js";

const SIZE = { width: 40, height: 20 };

function setup() {
  const registry = createNodeTypeRegistry();
  registry.register({ type: "plain", label: "Plain", defaultSize: SIZE });
  registry.register({
    type: "tank",
    label: "Tank",
    defaultSize: SIZE,
    capabilities: { resize: true },
    sizeLimits: { max: { width: 40, height: 100 } },
  });
  registry.register({
    type: "fixed",
    label: "Fixed",
    defaultSize: SIZE,
    capabilities: { resize: true },
    sizeLimits: { min: SIZE, max: SIZE },
  });
  const model = createGraphModel({ registry });
  const add = (type: string): NodeId => {
    model.createNode(type, { x: 0, y: 0 });
    const id = model.reader.nodes().at(-1)?.id;
    if (!id) throw new Error("no node");
    return id;
  };
  return { model, add, probe: capabilityProbe(model) };
}

const codeOf = (a: { available: boolean; reason?: { code: string } }) =>
  a.available ? "available" : a.reason?.code;

describe("MOD-11, NOD-04a capability probe for resize, rotate and mirror", () => {
  it("a type that did not opt in cannot resize but can rotate and mirror", () => {
    const { add, probe } = setup();
    const id = add("plain");
    expect(codeOf(probe("resize", id))).toBe("capability-denied");
    expect(codeOf(probe("rotate", id))).toBe("available");
    expect(codeOf(probe("mirror", id))).toBe("available");
  });

  it("an instance override denies resizing an opted-in node", () => {
    const { model, add, probe } = setup();
    const id = add("tank");
    model.submit({
      ops: [
        {
          op: "update",
          entity: "node",
          id,
          fields: { capabilities: { new: { resize: false, rotate: false } } },
        },
      ],
    });
    expect(codeOf(probe("resize", id))).toBe("capability-denied");
    expect(codeOf(probe("rotate", id))).toBe("capability-denied");
  });

  it("a fixed-size node is unavailable with out-of-range", () => {
    const { add, probe } = setup();
    expect(codeOf(probe("resize", add("fixed")))).toBe("out-of-range");
  });

  it("an allowed node at its maximum width is still resizable", () => {
    const { add, probe } = setup();
    expect(codeOf(probe("resize", add("tank")))).toBe("available");
  });

  it("the tool context answers size limits, with the library default otherwise", () => {
    const { model, add } = setup();
    const id = add("tank");
    const scene = createGeometryScene(model);
    const selection = createSelectionModel();
    const base = {
      reader: model.reader,
      scene,
      selection,
      viewport: () => ({ zoom: 1, panX: 0, panY: 0 }),
      can: capabilityProbe(model),
    };
    const ctx = createToolContext({ ...base, sizeLimits: model.sizeLimits })();
    expect(ctx.sizeLimits(id).max).toEqual({ width: 40, height: 100 });
    expect(createToolContext(base)().sizeLimits(id)).toEqual(
      DEFAULT_SIZE_LIMITS,
    );
  });
});
