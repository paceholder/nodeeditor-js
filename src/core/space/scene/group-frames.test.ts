import { describe, expect, it } from "vitest";
import { type GroupId, groupId, nodeId } from "../../base/ids/ids.js";
import type { GraphModel } from "../../graph-model.js";
import {
  DEFAULT_GROUP_FRAME_METRICS,
  groupFrame,
  groupLockBox,
} from "../geometry/group-frame.js";
import { rect } from "../geometry/spaces.js";
import { createGeometryScene } from "./geometry-scene.js";
import { buildModel, twoPortNode } from "./scene-fixtures.js";

const a = nodeId("a");
const b = nodeId("b");
const c = nodeId("c");

function group(model: GraphModel, nodes: readonly (typeof a)[]): GroupId {
  const result = model.groupNodes(nodes);
  if (result.status !== "accepted") throw new Error("group failed");
  return result.changed.groups[0] as GroupId;
}

/** Nodes are 40 x 20 around their position; a at the origin, b to its right, c far away. */
function scene3() {
  const model = buildModel([
    twoPortNode("a", 0, 0),
    twoPortNode("b", 100, 40),
    twoPortNode("c", 1000, 0),
  ]);
  const scene = createGeometryScene(model);
  return { model, scene };
}

describe("group frame derived from members", () => {
  it("is the union of the members' body bounds plus padding and a title strip, without a browser", () => {
    const { model, scene } = scene3();
    const id = group(model, [a, b]);
    // Bodies span x -20..120 and y -10..50; padding 16, title strip 24.
    expect(scene.group(id)?.frame).toEqual(rect(-36, -50, 172, 116));
    expect(scene.group(id)?.titleStrip).toEqual(rect(-36, -50, 172, 24));
    expect(scene.group(id)?.members).toEqual([a, b]);
    expect(scene.groupMetrics).toEqual(DEFAULT_GROUP_FRAME_METRICS);
  });

  it("takes padding and title height from the scene options", () => {
    const model = buildModel([twoPortNode("a", 0, 0)]);
    const scene = createGeometryScene(model, {
      groupFrame: { padding: 10, titleHeight: 0 },
    });
    const id = group(model, [a]);
    expect(scene.group(id)?.frame).toEqual(rect(-30, -20, 60, 40));
  });

  it("follows a moved, resized, rotated, added and removed member", () => {
    const { model, scene } = scene3();
    const id = group(model, [a, b]);
    const frame = () => scene.group(id)?.frame;
    model.moveNodes([{ node: b, position: { x: 200, y: 40 } }]);
    expect(frame()).toEqual(rect(-36, -50, 272, 116));
    model.submit({
      ops: [
        {
          op: "update",
          entity: "node",
          id: b,
          fields: { capabilities: { new: { resize: true } } },
        },
      ],
    });
    model.submit({
      ops: [
        {
          op: "update",
          entity: "node",
          id: b,
          fields: {
            size: {
              old: { width: 40, height: 20 },
              new: { width: 80, height: 20 },
            },
          },
        },
      ],
    });
    expect(frame()).toEqual(rect(-36, -50, 292, 116));
    model.rotateNodes([b], 1);
    // An 80 x 20 body turned a quarter is 20 x 80 around (200, 40).
    expect(frame()).toEqual(rect(-36, -50, 262, 146));
    model.addToGroup(id, [c]);
    expect(frame()?.w).toBe(1072);
    model.removeFromGroup([b, c]);
    expect(frame()).toEqual(rect(-36, -50, 72, 76));
  });

  it("drops the frame when the group is removed and restores it on undo", () => {
    const { model, scene } = scene3();
    const id = group(model, [a, b]);
    model.ungroup([id]);
    expect(scene.group(id)).toBeUndefined();
    expect(scene.groups()).toEqual([]);
    model.undo();
    expect(scene.group(id)?.members).toEqual([a, b]);
  });

  it("rebuilds only the groups of changed nodes (targeted invalidation)", () => {
    const { model, scene } = scene3();
    const first = group(model, [a]);
    group(model, [b]);
    const before = scene.stats().groupRebuilds;
    model.moveNodes([{ node: a, position: { x: 5, y: 5 } }]);
    expect(scene.stats().groupRebuilds).toBe(before + 1);
    model.moveNodes([{ node: c, position: { x: 900, y: 0 } }]);
    expect(scene.stats().groupRebuilds).toBe(before + 1);
    model.renameGroup(first, "Renamed");
    expect(scene.stats().groupRebuilds).toBe(before + 2);
    expect(scene.group(first)?.record.title).toBe("Renamed");
  });

  it("lists groups in document order and culls by rectangle", () => {
    const { model, scene } = scene3();
    const far = group(model, [c]);
    const near = group(model, [a, b]);
    expect(scene.groups().map((g) => g.id)).toEqual([far, near]);
    expect(scene.groups(rect(-10, -10, 20, 20)).map((g) => g.id)).toEqual([
      near,
    ]);
    scene.rebuild();
    expect(scene.groups().map((g) => g.id)).toEqual([far, near]);
  });

  it("computes the frame of any list of bounds, and none for an empty list", () => {
    expect(groupFrame([], DEFAULT_GROUP_FRAME_METRICS)).toBeUndefined();
    expect(
      groupFrame(
        [rect(0, 0, 10, 10), rect(20, 20, 10, 10)],
        DEFAULT_GROUP_FRAME_METRICS,
      ),
    ).toEqual(rect(-16, -40, 62, 86));
  });
});

describe("group picking (z-order and interactive order)", () => {
  it("a node inside a frame wins over the frame, and the interior is not a hit", () => {
    const { model, scene } = scene3();
    group(model, [a, b]);
    expect(scene.pick({ x: 0, y: 0 }, { zoom: 1 }).map((h) => h.kind)).toEqual([
      "node",
    ]);
    // Blank interior between the two nodes.
    expect(scene.pick({ x: 50, y: 10 }, { zoom: 1 })).toEqual([]);
  });

  it("the title strip and the border are hits naming their part", () => {
    const { model, scene } = scene3();
    const id = group(model, [a, b]);
    expect(scene.pick({ x: 0, y: -40 }, { zoom: 1 })).toEqual([
      { kind: "group", groupId: id, part: "title" },
    ]);
    // Bottom edge is at y 66; left edge at x -36.
    expect(scene.pick({ x: 50, y: 67 }, { zoom: 1 })).toEqual([
      { kind: "group", groupId: id, part: "border" },
    ]);
    expect(scene.pick({ x: -34, y: 20 }, { zoom: 1 })).toEqual([
      { kind: "group", groupId: id, part: "border" },
    ]);
    expect(scene.pick({ x: 50, y: 75 }, { zoom: 1 })).toEqual([]);
  });

  it("group hits follow every other candidate and can be turned off", () => {
    const { model, scene } = scene3();
    const id = group(model, [a, b]);
    // A free node dropped by keyboard onto the title strip keeps priority over it.
    model.moveNodes([{ node: c, position: { x: 0, y: -40 } }]);
    expect(scene.pick({ x: 0, y: -40 }, { zoom: 1 })).toEqual([
      { kind: "node", nodeId: c },
      { kind: "group", groupId: id, part: "title" },
    ]);
    expect(scene.pick({ x: 60, y: -40 }, { zoom: 1, groups: false })).toEqual(
      [],
    );
  });

  it("the lock target keeps a constant size in screen pixels at zoom 0.5 and 2", () => {
    const { model, scene } = scene3();
    const id = group(model, [a, b]);
    const frame = scene.group(id)?.frame;
    if (!frame) throw new Error("no frame");
    for (const zoom of [0.5, 2]) {
      const box = groupLockBox(frame, scene.groupMetrics, zoom);
      expect(box.w * zoom).toBeCloseTo(16);
      expect((frame.x + frame.w - (box.x + box.w)) * zoom).toBeCloseTo(4);
      const centre = { x: box.x + box.w / 2, y: box.y + box.h / 2 };
      expect(scene.pick(centre, { zoom })).toEqual([
        { kind: "group", groupId: id, part: "lock" },
      ]);
      // One pixel left of the box is title strip, not lock.
      const outside = { x: box.x - 1 / zoom, y: centre.y };
      expect(scene.pick(outside, { zoom })[0]).toMatchObject({ part: "title" });
    }
  });

  it("where two frames overlap, the later group in document order is first", () => {
    const { model, scene } = scene3();
    const first = group(model, [a]);
    const second = group(model, [b]);
    model.moveNodes([{ node: b, position: { x: 10, y: 0 } }]);
    const hits = scene.pick({ x: 5, y: -40 }, { zoom: 1 });
    expect(hits.map((h) => (h.kind === "group" ? h.groupId : ""))).toEqual([
      second,
      first,
    ]);
    expect(groupId(first)).toBe(first);
  });
});
