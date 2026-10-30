import { describe, expect, it, vi } from "vitest";
import { connectionId, nodeId } from "../../base/ids/ids.js";
import type { QuarterTurns } from "../../data/model/values.js";
import { createGraphModel } from "../../graph-model.js";
import { applyPoint } from "../geometry/affine.js";
import { createGeometryRegistry } from "../geometry/geometry-registry.js";
import { pathDistance, pathPointAt } from "../geometry/path-geometry.js";
import { createImageSymbolGeometry } from "../geometry/presets/image-symbol-geometry.js";
import { rectContainsPoint, rectsIntersect } from "../geometry/rect.js";
import { shapeContains } from "../geometry/shapes.js";
import { rect } from "../geometry/spaces.js";
import { between, seededRandom } from "../geometry/test-utils.js";
import { createBruteForceIndex } from "../spatial-index/brute-force-index.js";
import { createGeometryScene } from "./geometry-scene.js";
import type { HitCandidate } from "./picking.js";
import { buildModel, submitChunked, twoPortNode } from "./scene-fixtures.js";

// Pass-through spy on exact path distance, so a test can count precise-phase work.
vi.mock("../geometry/path-geometry.js", async (importOriginal) => {
  const real =
    await importOriginal<typeof import("../geometry/path-geometry.js")>();
  return { ...real, pathDistance: vi.fn(real.pathDistance) };
});

describe("GEO-04a hit result identity and order", () => {
  it("GEO-04a port over node body: the port comes first and the node follows", () => {
    const model = buildModel([twoPortNode("a", 0, 0, { w: 100, h: 40 })]);
    const scene = createGeometryScene(model);
    // Right port sits at (50, 0): on the node outline, inside capture range.
    const hits = scene.pick({ x: 48, y: 1 }, { zoom: 1 });
    expect(hits).toEqual([
      { kind: "port", nodeId: "a", portId: "aR" },
      { kind: "node", nodeId: "a" },
    ]);
  });

  it("GEO-04a coincident paths: both are returned in a deterministic order", () => {
    const place = { x: 1, y: 0.5 };
    const spec = (id: string, x: number) => ({
      id,
      x,
      y: 0,
      ports: [
        { id: `${id}1`, placement: place },
        { id: `${id}2`, placement: place },
      ],
    });
    const conns = [
      ["c1", "a", "a1", "b", "b1"],
      ["c2", "a", "a2", "b", "b2"],
    ] as const;
    const model = buildModel([spec("a", 0), spec("b", 400)], conns);
    const scene = createGeometryScene(model, { routeMode: () => "straight" });
    const hits = scene.pick({ x: 200, y: 0 }, { zoom: 1 });
    expect(hits).toEqual([
      { kind: "connection", connectionId: "c2" },
      { kind: "connection", connectionId: "c1" },
    ]);
    const again = createGeometryScene(model, {
      routeMode: () => "straight",
      index: createBruteForceIndex<string>(),
    });
    expect(again.pick({ x: 200, y: 0 }, { zoom: 1 })).toEqual(hits);
  });

  it("VIS-02 connections above nodes override the default interactive order", () => {
    const model = buildModel(
      [
        twoPortNode("a", 0, 0, { w: 100, h: 40 }),
        twoPortNode("b", 300, 0, { w: 100, h: 40 }),
      ],
      [["c1", "a", "aR", "b", "bL"]],
    );
    const at = { x: 40, y: 0 }; // inside node a's body and on the connection
    const normal = createGeometryScene(model, { routeMode: () => "straight" });
    const kinds = (hits: HitCandidate[]) => hits.map((h) => h.kind);
    expect(kinds(normal.pick(at, { zoom: 1 }))).toEqual(["node"]);
    // Move the point onto the overlap: node a spans x -50..50, wire starts at 50.
    const overlap = { x: 50, y: 0 };
    expect(kinds(normal.pick(overlap, { zoom: 1 }))).toEqual([
      "port",
      "node",
      "connection",
    ]);
    const connectionsOnTop = createGeometryScene(model, {
      routeMode: () => "straight",
      layerOrder: ["node", "connection", "port"],
    });
    expect(kinds(connectionsOnTop.pick(overlap, { zoom: 1 }))).toEqual([
      "port",
      "connection",
      "node",
    ]);
    const perCall = normal.pick(overlap, {
      zoom: 1,
      order: ["connection", "node", "port"],
    });
    expect(kinds(perCall)).toEqual(["connection", "node", "port"]);
  });
});

describe("GEO-05 screen-space tolerances", () => {
  it("GEO-05 capture radius at zoom 0.5 and 4 stays 8 CSS pixels", () => {
    const model = buildModel([twoPortNode("a", 0, 0, { w: 20, h: 20 })]);
    const scene = createGeometryScene(model);
    // Right port at world (10, 0). Probe points to its right, outside the 20x20 body.
    const portHit = (d: number, zoom: number) =>
      scene
        .pick({ x: 10 + d, y: 0 }, { zoom })
        .some((h) => h.kind === "port" && h.portId === "aR");
    // Zoom 0.5: 8 px = 16 world units.
    expect(portHit(15.9, 0.5)).toBe(true);
    expect(portHit(16.1, 0.5)).toBe(false);
    // Zoom 4: 8 px = 2 world units.
    expect(portHit(1.9, 4)).toBe(true);
    expect(portHit(2.1, 4)).toBe(false);
  });

  it("GEO-05 connection tolerance is in CSS pixels as well", () => {
    const model = buildModel(
      [twoPortNode("a", 0, 0), twoPortNode("b", 1000, 0)],
      [["c1", "a", "aR", "b", "bL"]],
    );
    const scene = createGeometryScene(model, { routeMode: () => "straight" });
    const hit = (dy: number, zoom: number) =>
      scene.pick({ x: 500, y: dy }, { zoom, tolerancePx: 6 }).length > 0;
    expect(hit(11.9, 0.5)).toBe(true);
    expect(hit(12.1, 0.5)).toBe(false);
    expect(hit(1.4, 4)).toBe(true);
    expect(hit(1.6, 4)).toBe(false);
    expect(scene.pick({ x: 500, y: 0 }, { zoom: Number.NaN })).toEqual([]);
  });
});

describe("GEO-04 two-phase picking across transforms", () => {
  const diamond = createImageSymbolGeometry({
    outline: [
      { x: 0.5, y: 0 },
      { x: 1, y: 0.5 },
      { x: 0.5, y: 1 },
      { x: 0, y: 0.5 },
    ],
  });
  const ports = [
    { id: "t", placement: { x: 0.5, y: 0 } },
    { id: "r", placement: { x: 1, y: 0.5 } },
    { id: "b", placement: { x: 0.5, y: 1 } },
    { id: "l", placement: { x: 0, y: 0.5 } },
  ];

  it("GEO-04 picking agrees with the node transform in all 4 rotations x mirror", () => {
    const rnd = seededRandom(21);
    for (const rotation of [0, 1, 2, 3] as QuarterTurns[]) {
      for (const mirrored of [false, true]) {
        const model = buildModel([
          {
            id: "d",
            x: 300,
            y: -40,
            w: 25,
            h: 49,
            rotation,
            mirrored,
            type: "diamond",
            ports,
          },
        ]);
        const registry = createGeometryRegistry();
        registry.register("diamond", diamond);
        const scene = createGeometryScene(model, { registry });
        const entry = scene.node(nodeId("d"));
        if (!entry) throw new Error("setup");
        // Every anchor is a port hit at its transformed position, tip-of-diamond too.
        for (const a of entry.anchors) {
          const hits = scene.pick(a.position, { zoom: 1 });
          expect(hits[0]).toEqual({
            kind: "port",
            nodeId: "d",
            portId: a.portId,
          });
        }
        // Node hits equal local containment mapped through the same transform.
        for (let i = 0; i < 300; i++) {
          const local = { x: between(rnd, -30, 30), y: between(rnd, -30, 30) };
          const world = applyPoint(entry.toWorld, local);
          const inside = shapeContains(entry.hitShape, local);
          // Skip points inside any port capture radius: those add port hits first.
          const hits = scene
            .pick(world, { zoom: 1 })
            .filter((h) => h.kind === "node");
          expect(hits.length === 1).toBe(inside);
        }
        // The bounding box corner of the rotated diamond is not a node hit (GEO-04).
        const b = entry.bodyBounds;
        const corner = { x: b.x + 0.5, y: b.y + 0.5 };
        expect(
          scene.pick(corner, { zoom: 1 }).some((h) => h.kind === "node"),
        ).toBe(false);
      }
    }
  });
});

describe("IDX-01 large fixture", () => {
  it("IDX-01 rectangle query on 10k nodes matches brute force, and picking matches too", () => {
    const rnd = seededRandom(1234);
    const N = 10_000;
    const nodes = Array.from({ length: N }, (_, i) => ({
      id: `n${i}`,
      x: Math.round(between(rnd, 0, 20_000)),
      y: Math.round(between(rnd, 0, 20_000)),
      w: 30,
      h: 20,
      rotation: (i % 4) as QuarterTurns,
      mirrored: i % 3 === 0,
      ports: [
        { id: `n${i}i1`, placement: { x: 0, y: 0.25 } },
        { id: `n${i}i2`, placement: { x: 0, y: 0.75 } },
        { id: `n${i}o1`, placement: { x: 1, y: 0.25 } },
        { id: `n${i}o2`, placement: { x: 1, y: 0.75 } },
      ],
    }));
    const conns: [string, string, string, string, string][] = [];
    for (let i = 0; i < N; i++) {
      for (const k of [1, 2]) {
        const to = (i + k * 37) % N;
        conns.push([
          `c${conns.length}`,
          `n${i}`,
          `n${i}o${k}`,
          `n${to}`,
          `n${to}i${k}`,
        ]);
      }
    }
    const model = createGraphModel();
    submitChunked(model, nodes, conns);
    expect(model.reader.connections().length).toBe(20_000);

    const tree = createGeometryScene(model, { routeMode: () => "straight" });
    const brute = createGeometryScene(model, {
      routeMode: () => "straight",
      index: createBruteForceIndex<string>(),
    });

    for (let q = 0; q < 20; q++) {
      const area = rect<"world">(
        between(rnd, 0, 19_000),
        between(rnd, 0, 19_000),
        800,
        600,
      );
      const items = tree.queryRect(area);
      const expectedNodes = model.reader
        .nodes()
        .filter((nr) => {
          const e = tree.node(nr.id);
          return e && rectsIntersect(e.paintedBounds, area);
        })
        .map((nr) => nr.id)
        .sort();
      const got = items
        .filter((i) => i.kind === "node")
        .map((i) => i.id as string)
        .sort();
      expect(got).toEqual(expectedNodes);
      expect(brute.queryRect(area)).toEqual(items);
    }

    for (let q = 0; q < 200; q++) {
      const point = { x: between(rnd, 0, 20_000), y: between(rnd, 0, 20_000) };
      const zoom = [0.5, 1, 2][q % 3] as number;
      const hits = tree.pick(point, { zoom });
      expect(brute.pick(point, { zoom })).toEqual(hits);
      // Independent expectation by scanning every entry.
      const expectPorts = new Set<string>();
      let nodeHits = 0;
      let connHits = 0;
      for (const nr of model.reader.nodes()) {
        const e = tree.node(nr.id);
        if (!e) continue;
        for (const a of e.anchors) {
          if (
            Math.hypot(point.x - a.position.x, point.y - a.position.y) <=
            a.captureRadiusPx / zoom
          ) {
            expectPorts.add(a.portId);
          }
        }
        if (shapeContains(e.hitShape, applyPoint(e.toLocal, point))) nodeHits++;
      }
      for (const cr of model.reader.connections()) {
        const path = tree.connection(cr.id)?.path;
        if (path && pathDistance(path, point) <= 4 / zoom) connHits++;
      }
      expect(
        new Set(hits.flatMap((h) => (h.kind === "port" ? [h.portId] : []))),
      ).toEqual(expectPorts);
      expect(hits.filter((h) => h.kind === "node").length).toBe(nodeHits);
      expect(hits.filter((h) => h.kind === "connection").length).toBe(connHits);
    }
  }, 60_000);
});

describe("PERF-04 picking measures only nearby path pieces", () => {
  it("PERF-04 long path far from the pointer: no exact distance, not a candidate", () => {
    const model = buildModel(
      [twoPortNode("a", 0, 0), twoPortNode("b", 3000, 1500)],
      [["c1", "a", "aR", "b", "bL"]],
    );
    const scene = createGeometryScene(model);
    const entry = scene.connection(connectionId("c1"));
    if (!entry?.path || !entry.paintedBounds) throw new Error("no path");
    // Inside the wire's overall box, far from every piece's box.
    const point = { x: 2900, y: 100 };
    const radius = 8; // max(tolerance 4, capture radius 8) at zoom 1
    expect(rectContainsPoint(entry.paintedBounds, point)).toBe(true);
    expect(entry.segments.length).toBeGreaterThan(4);
    for (const box of entry.segmentBounds) {
      const grown = rect<"world">(
        box.x - radius,
        box.y - radius,
        box.w + 2 * radius,
        box.h + 2 * radius,
      );
      expect(rectContainsPoint(grown, point)).toBe(false);
    }
    const counter = vi.mocked(pathDistance);
    counter.mockClear();
    expect(scene.pick(point, { zoom: 1 })).toEqual([]);
    expect(counter).not.toHaveBeenCalled();

    // A point on the curve is measured against nearby pieces only, and hits.
    const onCurve = pathPointAt(entry.path, 0.5);
    counter.mockClear();
    expect(scene.pick(onCurve, { zoom: 1 })).toEqual([
      { kind: "connection", connectionId: "c1" },
    ]);
    expect(counter.mock.calls.length).toBeGreaterThan(0);
    expect(counter.mock.calls.length).toBeLessThanOrEqual(3);
  });
});

describe("LAY-04 hidden ports are not pickable", () => {
  it("LAY-04 ports: false yields the node at a port anchor, never the port", () => {
    const model = buildModel([twoPortNode("a", 0, 0, { w: 100, h: 40 })]);
    const scene = createGeometryScene(model);
    // Right port anchor at (50, 0), on the node outline.
    expect(scene.pick({ x: 50, y: 0 }, { zoom: 0.1, ports: false })).toEqual([
      { kind: "node", nodeId: "a" },
    ]);
    expect(scene.pick({ x: 50, y: 0 }, { zoom: 0.1 })[0]).toEqual({
      kind: "port",
      nodeId: "a",
      portId: "aR",
    });
    // Outside the body but inside the capture radius: nothing without ports.
    const outside = { x: 50 + 30, y: 0 };
    expect(scene.pick(outside, { zoom: 0.1 })).toEqual([
      { kind: "port", nodeId: "a", portId: "aR" },
    ]);
    expect(scene.pick(outside, { zoom: 0.1, ports: false })).toEqual([]);
  });
});
