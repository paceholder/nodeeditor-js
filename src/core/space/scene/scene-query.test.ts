import { describe, expect, it } from "vitest";
import { nodeId } from "../../base/ids/ids.js";
import { mkConn, mkNode } from "../../data/model/test-helpers.js";
import type { GraphModel } from "../../graph-model.js";
import { type Rect, rect } from "../geometry/spaces.js";
import { between, seededRandom } from "../geometry/test-utils.js";
import { createBruteForceIndex } from "../spatial-index/brute-force-index.js";
import type { SpatialIndex } from "../spatial-index/spatial-index.js";
import { createGeometryScene, type SceneLayer } from "./geometry-scene.js";
import { buildModel, graphOps, twoPortNode } from "./scene-fixtures.js";
import { sceneReference } from "./scene-reference.js";

const n = nodeId;
const EVERYTHING = rect<"world">(-1e5, -1e5, 2e5, 2e5);

/** Brute-force index that counts rectangle queries. */
function countingIndex(): {
  index: SpatialIndex<string>;
  queries: () => number;
} {
  const inner = createBruteForceIndex<string>();
  let queries = 0;
  const index: SpatialIndex<string> = {
    insert: (k, b) => inner.insert(k, b),
    update: (k, b) => inner.update(k, b),
    remove: (k) => inner.remove(k),
    queryRect: (r, out) => {
      queries++;
      inner.queryRect(r, out);
    },
    queryPoint: (p, r, out) => inner.queryPoint(p, r, out),
    get size() {
      return inner.size;
    },
    clear: () => inner.clear(),
  };
  return { index, queries: () => queries };
}

/** 30 nodes on a grid with z in {0, 1} (many ties) and a ring of connections. */
function seededModel(): GraphModel {
  const nodes = Array.from({ length: 30 }, (_, i) =>
    twoPortNode(`n${i}`, (i % 6) * 250, Math.floor(i / 6) * 250, { z: i % 2 }),
  );
  const conns = nodes.map(
    (_, i) =>
      [
        `c${i}`,
        `n${i}`,
        `n${i}R`,
        `n${(i + 7) % 30}`,
        `n${(i + 7) % 30}L`,
      ] as const,
  );
  return buildModel(nodes, conns);
}

/** One random edit: a move, a z change, an add or a removal. */
function randomEdit(model: GraphModel, rnd: () => number, step: number): void {
  const id = n(`n${Math.floor(between(rnd, 0, 30))}`);
  const roll = rnd();
  if (roll < 0.4) {
    const pos = { x: between(rnd, -600, 2000), y: between(rnd, -600, 2000) };
    model.moveNodes([{ node: id, position: pos }]);
  } else if (roll < 0.7) {
    const old = model.reader.getNode(id)?.z ?? 0;
    model.submit({
      ops: [
        {
          op: "update",
          entity: "node",
          id,
          fields: { z: { old, new: Math.floor(between(rnd, 0, 2)) } },
        },
      ],
    });
  } else if (roll < 0.85) {
    const to = n(`n${Math.floor(between(rnd, 0, 30))}`);
    if (to !== id)
      model.submit({
        ops: graphOps([], [[`k${step}`, id, `${id}R`, to, `${to}L`]]),
      });
  } else {
    const all = model.reader.connections();
    const victim = all[Math.floor(between(rnd, 0, all.length))];
    if (victim) model.deleteEntities({ connections: [victim.id] });
  }
}

describe("queryRect order", () => {
  it("per-layer numeric sorting matches the previous comparator with equal z", () => {
    const layerOrders: (readonly SceneLayer[])[] = [
      ["connection", "node", "port"],
      ["node", "connection", "port"],
      ["port"],
    ];
    for (const layers of layerOrders) {
      const model = seededModel();
      const scene = createGeometryScene(model, { layerOrder: layers });
      const rnd = seededRandom(99);
      for (let step = 0; step < 200; step++) {
        randomEdit(model, rnd, step);
        const area: Rect<"world"> = rect(
          between(rnd, -600, 1500),
          between(rnd, -600, 1500),
          between(rnd, 100, 2500),
          between(rnd, 100, 2500),
        );
        for (const mode of ["painted", "hit"] as const) {
          expect(scene.queryRect(area, mode)).toEqual(
            sceneReference(scene, model.reader, area, mode, layers),
          );
        }
      }
    }
  });

  // A patch cannot give two live entities one seq, so a reader that reports one seq for
  // every entity stands in for a host source that does.
  const sameSeq = (model: ReturnType<typeof buildModel>) => ({
    reader: { ...model.reader, seqOf: () => 5 },
    on: model.on,
  });

  it("nodes sharing z and seq fall back to ID order", () => {
    const model = buildModel([]);
    const ops = ["b", "a", "c"].map((id, i) => ({
      op: "add" as const,
      entity: "node" as const,
      record: mkNode(id, { position: { x: i * 10, y: 0 } }),
    }));
    expect(model.submit({ ops }).status).toBe("accepted");
    const scene = createGeometryScene(sameSeq(model));
    expect(scene.queryRect(EVERYTHING).map((i) => i.id)).toEqual([
      "a",
      "b",
      "c",
    ]);
  });
  it("connections sharing seq fall back to ID order", () => {
    const model = buildModel([
      twoPortNode("a", 0, 0),
      twoPortNode("b", 300, 0),
      twoPortNode("c", 600, 0),
    ]);
    const ends = [
      ["q", "a", "aR", "b", "bL"],
      ["p", "b", "bR", "c", "cL"],
      ["r", "a", "aL", "c", "cR"],
    ] as const;
    const ops = ends.map(([id, fn, fp, tn, tp]) => ({
      op: "add" as const,
      entity: "connection" as const,
      record: mkConn(id, fn, fp, tn, tp),
    }));
    const result = model.submit({ ops });
    expect(result.status, JSON.stringify(result)).toBe("accepted");
    const scene = createGeometryScene(sameSeq(model));
    const ids = scene
      .queryRect(EVERYTHING)
      .filter((i) => i.kind === "connection")
      .map((i) => i.id);
    expect(ids).toEqual(["p", "q", "r"]);
  });
});

describe("full-view result cache", () => {
  it("cached fit-all results equal uncached ones after interleaved edits", () => {
    const model = seededModel();
    const scene = createGeometryScene(model);
    const rnd = seededRandom(7);
    for (let step = 0; step < 300; step++) {
      randomEdit(model, rnd, step);
      const first = scene.queryRect(EVERYTHING);
      expect(first).toEqual(sceneReference(scene, model.reader, EVERYTHING));
      expect(scene.queryRect(EVERYTHING)).toEqual(first);
      expect(scene.queryRect(EVERYTHING, "hit")).toEqual(
        sceneReference(scene, model.reader, EVERYTHING, "hit"),
      );
    }
    const fresh = createGeometryScene(model);
    expect(scene.queryRect(EVERYTHING)).toEqual(fresh.queryRect(EVERYTHING));
  });

  it("a repeated fit-all query does not call the index until something changes", () => {
    const model = seededModel();
    const counted = countingIndex();
    const scene = createGeometryScene(model, { index: counted.index });
    const first = scene.queryRect(EVERYTHING);
    const calls = counted.queries();
    const second = scene.queryRect(EVERYTHING);
    expect(second).toEqual(first);
    expect(second).not.toBe(first);
    expect(counted.queries()).toBe(calls);

    // A z change only refreshes a record; it must still invalidate the cache.
    model.submit({
      ops: [
        {
          op: "update",
          entity: "node",
          id: n("n0"),
          fields: { z: { old: 0, new: 9 } },
        },
      ],
    });
    const third = scene.queryRect(EVERYTHING);
    expect(counted.queries()).toBe(calls + 1);
    expect(third.at(-1)).toEqual({ kind: "node", id: "n0" });

    // A viewport that misses part of the scene is never served from the cache.
    scene.queryRect(rect(0, 0, 300, 300));
    scene.queryRect(rect(0, 0, 300, 300));
    expect(counted.queries()).toBe(calls + 3);
  });
});
