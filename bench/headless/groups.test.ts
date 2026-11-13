import type { GroupId, NodeId } from "@paceholder/nodeeditor-js";
import { describe, expect, it } from "vitest";
import { F_TYPICAL } from "../fixtures/fixture-specs.js";
import { buildScene, loadFixture } from "./setup.js";

const GROUPS = 20;
const SIZE = 10;

/** F-TYPICAL with twenty groups of ten nodes each, taken in node order. */
function grouped() {
  const { model } = loadFixture(F_TYPICAL);
  const nodes = model.reader.nodes().map((n) => n.id);
  const groups: { id: GroupId; members: NodeId[] }[] = [];
  for (let g = 0; g < GROUPS; g++) {
    const members = nodes.slice(g * SIZE, (g + 1) * SIZE);
    const made = model.groupNodes(members, { title: `Group ${g + 1}` });
    if (made.status !== "accepted") throw new Error("grouping failed");
    groups.push({ id: made.changed.groups[0] as GroupId, members });
  }
  return { model, groups };
}

describe("group frames in F-TYPICAL with twenty groups", () => {
  it("dragging a whole group rebuilds its members and one frame, and no other group (targeted invalidation)", () => {
    const { model, groups } = grouped();
    const scene = buildScene(model);
    expect(scene.groups()).toHaveLength(GROUPS);
    const target = groups[7];
    if (!target) throw new Error("no group");
    const before = scene.stats();
    const result = model.moveNodes(
      target.members.map((id) => {
        const p = model.reader.getNode(id)?.position ?? { x: 0, y: 0 };
        return { node: id, position: { x: p.x + 40, y: p.y + 24 } };
      }),
    );
    expect(result.status).toBe("accepted");
    const after = scene.stats();
    expect(after.nodeRebuilds - before.nodeRebuilds).toBe(SIZE);
    expect(after.groupRebuilds - before.groupRebuilds).toBe(1);
  });

  it("moving a node outside every group rebuilds no frame", () => {
    const { model } = grouped();
    const scene = buildScene(model);
    const free = model.reader.nodes().find((n) => n.group === undefined);
    if (!free) throw new Error("fixture has no free node");
    const before = scene.stats().groupRebuilds;
    model.moveNodes([
      {
        node: free.id,
        position: { x: free.position.x + 5, y: free.position.y },
      },
    ]);
    expect(scene.stats().groupRebuilds).toBe(before);
  });

  it("picking over twenty frames stays a scan of the frames, not of the nodes", () => {
    const { model, groups } = grouped();
    const scene = buildScene(model);
    const frame = scene.group(groups[0]?.id as GroupId)?.frame;
    if (!frame) throw new Error("no frame");
    const start = performance.now();
    let hits = 0;
    for (let i = 0; i < 2000; i++) {
      hits += scene.pick(
        { x: frame.x + 30, y: frame.y + 5 },
        { zoom: 1 },
      ).length;
    }
    const perPick = (performance.now() - start) / 2000;
    expect(hits).toBeGreaterThan(0);
    // Generous: a pick is a few microseconds; this only catches a scan gone quadratic.
    expect(perPick).toBeLessThan(1);
  });
});
