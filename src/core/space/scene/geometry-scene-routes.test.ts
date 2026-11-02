import { describe, expect, it } from "vitest";
import { connectionId, nodeId } from "../../base/ids/ids.js";
import { createGraphModel } from "../../graph-model.js";
import { rect } from "../geometry/spaces.js";
import {
  createBezierRouter,
  createStraightRouter,
} from "../routing/basic-routers.js";
import { createOrthogonalRouter } from "../routing/orthogonal-router.js";
import { createRouteRegistry } from "../routing/route-registry.js";
import { verticesOf } from "../routing/test-kit.js";
import { createGeometryScene, type GeometryScene } from "./geometry-scene.js";
import { graphOps, type NodeSpec, twoPortNode } from "./scene-fixtures.js";

const n = nodeId;
const c = connectionId;

function pathOf(scene: GeometryScene, id: string) {
  const path = scene.connection(c(id))?.path;
  if (!path) throw new Error(`no path for ${id}`);
  return path;
}

/** A model whose connections carry the given kinds (`default` when omitted). */
function modelWith(
  nodes: readonly NodeSpec[],
  conns: readonly (readonly [
    string,
    string,
    string,
    string,
    string,
    string?,
  ])[],
) {
  const model = createGraphModel();
  model.registry.register({
    type: "t",
    label: "T",
    defaultSize: { width: 40, height: 20 },
    capabilities: { resize: true },
  });
  const ops = graphOps(
    nodes,
    conns.map(([id, a, ap, b, bp]) => [id, a, ap, b, bp] as const),
  ).map((op) => {
    if (op.op !== "add" || op.entity !== "connection") return op;
    const kind = conns.find(([id]) => id === op.record.id)?.[5];
    return kind ? { ...op, record: { ...op.record, kind } } : op;
  });
  if (model.submit({ ops }).status !== "accepted") throw new Error("fixture");
  return model;
}

/** n0 -> n1 -> n2 -> n3 along x, with kinds default, ortho, direct. */
function mixed() {
  return modelWith(
    [0, 1, 2, 3].map((i) => twoPortNode(`n${i}`, i * 200, i * 50)),
    [
      ["c0", "n0", "n0R", "n1", "n1L"],
      ["c1", "n1", "n1R", "n2", "n2L", "ortho"],
      ["c2", "n2", "n2R", "n3", "n3L", "direct"],
    ],
  );
}

function routesFor() {
  const routes = createRouteRegistry();
  routes.register("ortho", createOrthogonalRouter());
  routes.register("direct", createStraightRouter());
  return routes;
}

describe("scene routes per connection kind", () => {
  it("each kind uses its router; unregistered kinds use the Bezier default", () => {
    const scene = createGeometryScene(mixed(), { routes: routesFor() });
    expect(scene.connection(c("c0"))?.path?.kind).toBe("cubic");
    expect(scene.connection(c("c1"))?.path?.kind).toBe("polyline");
    expect(scene.connection(c("c2"))?.path?.kind).toBe("line");
    expect(verticesOf(pathOf(scene, "c1"))).toEqual([
      { x: 220, y: 50 },
      { x: 300, y: 50 },
      { x: 300, y: 100 },
      { x: 380, y: 100 },
    ]);
  });

  it("entries carry the route outcome", () => {
    const scene = createGeometryScene(mixed(), { routes: routesFor() });
    expect(scene.connection(c("c0"))?.route).toEqual({
      status: "complete",
      clearOf: "nothing",
    });
    expect(scene.connection(c("c1"))?.route).toEqual({
      status: "complete",
      clearOf: "endpoint-nodes",
    });
  });
});

describe("switching a kind's route", () => {
  it("Switch route mode: only that kind is recomputed, with no patch or history entry", () => {
    const model = mixed();
    const routes = routesFor();
    const scene = createGeometryScene(model, { routes });
    const changes: unknown[] = [];
    model.on("change", (e) => changes.push(e));
    const history = model.historyState();
    const before = scene.stats();
    const c0 = scene.connection(c("c0"));
    const c1 = scene.connection(c("c1"));
    const c2 = scene.connection(c("c2"));

    routes.replace("default", createOrthogonalRouter());

    const after = scene.stats();
    expect(after.connectionRebuilds - before.connectionRebuilds).toBe(1);
    expect(after.nodeRebuilds).toBe(before.nodeRebuilds);
    const next = scene.connection(c("c0"));
    expect(next?.path?.kind).toBe("polyline");
    expect(next?.id).toBe(c0?.id);
    expect(next?.record).toBe(c0?.record);
    expect(next?.path?.p0).toEqual(c0?.path?.p0);
    expect(next?.path?.p1).toEqual(c0?.path?.p1);
    expect(scene.connection(c("c1"))).toBe(c1);
    expect(scene.connection(c("c2"))).toBe(c2);
    expect(changes).toEqual([]);
    expect(model.historyState()).toEqual(history);
    // Back to Bezier: the same paths as before.
    routes.replace("default", createBezierRouter());
    expect(scene.connection(c("c0"))?.path).toEqual(c0?.path);
  });

  it("the scene stops listening to the route registry after dispose", () => {
    const routes = routesFor();
    const scene = createGeometryScene(mixed(), { routes });
    scene.dispose();
    const before = scene.stats();
    routes.replace("ortho", createStraightRouter());
    expect(scene.stats()).toEqual(before);
    expect(scene.connection(c("c1"))?.path?.kind).toBe("polyline");
  });
});

/** Two nodes far apart, joined by one orthogonal connection. */
function apart() {
  return modelWith(
    [
      twoPortNode("a", 0, 0),
      twoPortNode("b", 400, 300),
      twoPortNode("z", 0, 600),
    ],
    [
      ["c1", "a", "aR", "b", "bL"],
      ["c2", "z", "zR", "b", "bR"],
    ],
  );
}

const orthogonalDefault = () =>
  createRouteRegistry({ default: createOrthogonalRouter() });

describe("node changes with orthogonal routes", () => {
  it("moving a node recomputes exactly its incident routes", () => {
    const model = apart();
    const scene = createGeometryScene(model, { routes: orthogonalDefault() });
    const before = scene.stats();
    model.moveNodes([{ node: n("a"), position: { x: 0, y: 40 } }]);
    expect(scene.stats().connectionRebuilds - before.connectionRebuilds).toBe(
      1,
    );
    expect(verticesOf(pathOf(scene, "c1"))).toEqual([
      { x: 20, y: 40 },
      { x: 200, y: 40 },
      { x: 200, y: 300 },
      { x: 380, y: 300 },
    ]);
    const mid = scene.stats();
    model.moveNodes([{ node: n("b"), position: { x: 420, y: 300 } }]);
    expect(scene.stats().connectionRebuilds - mid.connectionRebuilds).toBe(2);
  });

  it("Rotated node: the route leaves along the rotated normal", () => {
    const model = apart();
    const scene = createGeometryScene(model, { routes: orthogonalDefault() });
    model.rotateNodes([n("a")], 1);
    const anchor = scene.node(n("a"))?.anchors.find((x) => x.portId === "aR");
    const v = verticesOf(pathOf(scene, "c1"));
    expect(v[0]).toEqual(anchor?.position);
    const first = {
      x: (v[1]?.x ?? 0) - (v[0]?.x ?? 0),
      y: (v[1]?.y ?? 0) - (v[0]?.y ?? 0),
    };
    // A quarter turn makes the right-hand port face along y.
    expect(Math.round(anchor?.normal.x ?? 1)).toBe(0);
    expect(first.x).toBe(0);
    expect(Math.sign(first.y)).toBe(Math.sign(anchor?.normal.y ?? 0));
  });

  it("resize and mirror recompute incident routes", () => {
    const model = apart();
    const scene = createGeometryScene(model, { routes: orthogonalDefault() });
    let before = scene.stats();
    expect(model.resizeNode(n("a"), { width: 80, height: 20 }).status).toBe(
      "accepted",
    );
    expect(scene.stats().connectionRebuilds - before.connectionRebuilds).toBe(
      1,
    );
    expect(scene.connection(c("c1"))?.path?.p0).toEqual({ x: 40, y: 0 });
    before = scene.stats();
    model.mirrorNodes([n("b")]);
    expect(scene.stats().connectionRebuilds - before.connectionRebuilds).toBe(
      2,
    );
    const p = scene.connection(c("c1"))?.path;
    expect(p?.kind).toBe("polyline");
    expect(scene.connection(c("c1"))?.route?.clearOf).toBeDefined();
  });
});

describe("picking and culling orthogonal routes", () => {
  it("a click on the vertical middle segment hits the connection", () => {
    const scene = createGeometryScene(apart(), { routes: orthogonalDefault() });
    // c1 runs (20,0) -> (200,0) -> (200,300) -> (380,300).
    expect(scene.pick({ x: 201, y: 100 }, { zoom: 1 })).toEqual([
      { kind: "connection", connectionId: "c1" },
    ]);
  });

  it("a short route is one piece; its box only narrows candidates and the pick stays exact", () => {
    const scene = createGeometryScene(apart(), { routes: orthogonalDefault() });
    // c1 is 660 units long, under PIECE_LENGTH.
    expect(scene.connection(c("c1"))?.segments.length).toBe(1);
    expect(scene.queryRect(rect(325, 55, 10, 10))).toEqual([
      { kind: "connection", id: "c1" },
    ]);
    expect(scene.pick({ x: 330, y: 60 }, { zoom: 1 })).toEqual([]);
  });

  it("a point inside a long route's overall box but far from every piece is not a candidate", () => {
    const model = modelWith(
      [twoPortNode("a", 0, 0), twoPortNode("b", 1000, 600)],
      [["c1", "a", "aR", "b", "bL"]],
    );
    const scene = createGeometryScene(model, { routes: orthogonalDefault() });
    // c1 runs (20,0) -> (500,0) -> (500,600) -> (980,600), one corner per piece.
    expect(scene.connection(c("c1"))?.segments.length).toBe(2);
    expect(scene.pick({ x: 800, y: 100 }, { zoom: 1 })).toEqual([]);
    expect(scene.queryRect(rect(795, 95, 10, 10))).toEqual([]);
  });

  it("queryRect returns a connection whose middle segment alone crosses the viewport", () => {
    const scene = createGeometryScene(apart(), { routes: orthogonalDefault() });
    expect(scene.queryRect(rect(150, 100, 100, 100))).toEqual([
      { kind: "connection", id: "c1" },
    ]);
  });
});

describe("route constraints in the scene", () => {
  const pin = [{ kind: "segment", orientation: "vertical", at: 150 }] as const;

  it("a route update op rebuilds only that connection", () => {
    const model = mixed();
    const scene = createGeometryScene(model, { routes: routesFor() });
    const before = scene.stats();
    const other = scene.connection(c("c0"));
    const seen: unknown[] = [];
    const spy = createRouteRegistry();
    spy.register("ortho", {
      route: (input) => {
        seen.push(input.constraints);
        return createOrthogonalRouter().route(input);
      },
    });
    expect(
      model.execute({ kind: "setRoute", connection: c("c1"), route: pin })
        .status,
    ).toBe("accepted");
    expect(scene.stats().connectionRebuilds - before.connectionRebuilds).toBe(
      1,
    );
    expect(scene.connection(c("c0"))).toBe(other);
    expect(scene.connection(c("c1"))?.record.route).toEqual(pin);
    // A fresh scene hands the stored constraints to the router of the kind.
    createGeometryScene(model, { routes: spy });
    expect(seen).toEqual([pin]);
  });

  it("Route kind ignores constraints: Bezier draws the curve and the pin stays stored", () => {
    const model = mixed();
    const scene = createGeometryScene(model, { routes: routesFor() });
    const plain = pathOf(scene, "c0");
    model.execute({ kind: "setRoute", connection: c("c0"), route: pin });
    expect(pathOf(scene, "c0")).toEqual(plain);
    expect(scene.connection(c("c0"))?.realized).toBeUndefined();
    expect(model.reader.getConnection(c("c0"))?.route).toEqual(pin);
  });
});
