import { describe, expect, it } from "vitest";
import {
  connectionId,
  nodeId,
  type Point,
  portId,
  rect,
} from "../../../core/index.js";
import {
  cornerNode,
  createToolHarness,
} from "../../test-support/tool-harness.js";
import { connectionKey, nodeKey } from "../selection/selection-model.js";
import {
  contextTarget,
  keyboardTarget,
  selectOnOpen,
} from "./context-target.js";

const A = nodeKey(nodeId("a"));
const B = nodeKey(nodeId("b"));
const C = connectionKey(connectionId("c1"));

/** a at (0, 0) and b at (200, 0), both 40x20, joined a.aR to b.bL. */
const fixture = () =>
  createToolHarness({
    nodes: [cornerNode("a", 0, 0), cornerNode("b", 200, 0)],
    connections: [["c1", "a", "aR", "b", "bL"]],
  });

const hitsAt = (h: ReturnType<typeof fixture>, p: Point<"world">) =>
  h.scene.pick(p, { zoom: 1 });

describe("context-menu target from the ordered hits", () => {
  it("port, node, connection and canvas targets", () => {
    const h = fixture();
    expect(contextTarget(hitsAt(h, { x: 40, y: 10 }))).toEqual({
      kind: "port",
      node: nodeId("a"),
      port: portId("aR"),
    });
    expect(contextTarget(hitsAt(h, { x: 20, y: 5 }))).toEqual({
      kind: "node",
      node: nodeId("a"),
    });
    expect(contextTarget(hitsAt(h, { x: 120, y: 10 }))).toEqual({
      kind: "connection",
      connection: connectionId("c1"),
    });
    expect(contextTarget(hitsAt(h, { x: 120, y: 300 }))).toEqual({
      kind: "canvas",
    });
  });

  it("a connection hit keeps its member", () => {
    expect(
      contextTarget([
        { kind: "connection", connectionId: connectionId("c9"), member: "m2" },
      ]),
    ).toEqual({
      kind: "connection",
      connection: connectionId("c9"),
      member: "m2",
    });
  });
});

describe("select-on-open", () => {
  it("Right-click an unselected node: it becomes the only selection", () => {
    const h = fixture();
    h.selection.replace([A]);
    expect(
      selectOnOpen({ kind: "node", node: nodeId("b") }, h.selection),
    ).toEqual({ mode: "replace", keys: [B] });
  });

  it("Right-click inside a multi-selection: unchanged", () => {
    const h = fixture();
    h.selection.replace([A, B]);
    expect(
      selectOnOpen({ kind: "node", node: nodeId("b") }, h.selection),
    ).toBeUndefined();
  });

  it("a port selects its node; a connection selects itself; canvas leaves the selection", () => {
    const h = fixture();
    h.selection.replace([A]);
    const port = {
      kind: "port",
      node: nodeId("b"),
      port: portId("bL"),
    } as const;
    expect(selectOnOpen(port, h.selection)).toEqual({
      mode: "replace",
      keys: [B],
    });
    expect(
      selectOnOpen(
        { kind: "connection", connection: connectionId("c1") },
        h.selection,
      ),
    ).toEqual({ mode: "replace", keys: [C] });
    expect(selectOnOpen({ kind: "canvas" }, h.selection)).toBeUndefined();
  });
});

describe("keyboard target and placement", () => {
  const visible = rect<"world">(0, -100, 500, 300);

  it("the primary node, at the centre of its bounds", () => {
    const h = fixture();
    h.selection.replace([B, A]);
    expect(keyboardTarget(h.selection, h.scene, visible)).toEqual({
      target: { kind: "node", node: nodeId("a") },
      world: { x: 20, y: 10 },
    });
  });

  it("the primary connection, at the centre of its painted bounds", () => {
    const h = fixture();
    h.selection.replace([C]);
    const r = keyboardTarget(h.selection, h.scene, visible);
    expect(r.target).toEqual({
      kind: "connection",
      connection: connectionId("c1"),
    });
    expect(r.world.x).toBeCloseTo(120);
  });

  it("the view centre for an empty selection", () => {
    const h = fixture();
    expect(keyboardTarget(h.selection, h.scene, visible)).toEqual({
      target: { kind: "canvas" },
      world: { x: 250, y: 50 },
    });
  });

  it("an off-screen entity is clamped into the visible rectangle", () => {
    const h = fixture();
    h.selection.replace([B]);
    const left = rect<"world">(-400, -100, 300, 200);
    expect(keyboardTarget(h.selection, h.scene, left).world).toEqual({
      x: -100,
      y: 10,
    });
  });
});
