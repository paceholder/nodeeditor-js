import { describe, expect, it } from "vitest";
import type { NodeId } from "../../base/ids/ids.js";
import type { CapabilityOverrides } from "../../data/model/records.js";
import type { NodeFieldChanges } from "../../data/patch/types.js";
import type { GraphModel } from "../../graph-model.js";
import { make, makeModel } from "../commands/test-kit.js";

const SIZE = { width: 40, height: 20 };

/** An opted-in node at (100, 100) with rotation 1, mirrored, and the given locks. */
function lockedNode(locks: CapabilityOverrides) {
  const model = makeModel();
  model.registry.register({
    type: "tank",
    label: "Tank",
    defaultSize: SIZE,
    capabilities: { resize: true },
  });
  const { node } = make(model, "tank", 100, 100);
  update(model, node, {
    rotation: { old: 0, new: 1 },
    mirrored: { old: false, new: true },
    capabilities: { new: locks },
  });
  return { model, node };
}

function update(model: GraphModel, id: NodeId, fields: NodeFieldChanges) {
  return model.submit({ ops: [{ op: "update", entity: "node", id, fields }] });
}

function refusal(result: ReturnType<GraphModel["submit"]>) {
  return result.status === "rejected"
    ? result.rejection.message
    : result.status;
}

describe("compound capability rules", () => {
  it("a move-locked node resizes with a corner fixed, and its undo is accepted", () => {
    const { model, node } = lockedNode({ move: false });
    const before = model.reader.getNode(node);
    const result = model.resizeNode(
      node,
      { width: 70, height: 50 },
      { x: -1, y: -1 },
    );
    expect(result.status).toBe("accepted");
    expect(model.reader.getNode(node)?.position).not.toEqual(before?.position);
    expect(model.undo().status).toBe("accepted");
    expect(model.reader.getNode(node)).toEqual(before);
  });

  it("a position change larger than the size change implies needs move", () => {
    const { model, node } = lockedNode({ move: false });
    // Width +20 allows a shift of up to 10 along the local x axis (world y here).
    const ok = update(model, node, {
      size: { old: SIZE, new: { width: 60, height: 20 } },
      position: { old: { x: 100, y: 100 }, new: { x: 100, y: 90 } },
    });
    expect(ok.status).toBe("accepted");
    const tooFar = update(model, node, {
      size: { old: { width: 60, height: 20 }, new: { width: 80, height: 20 } },
      position: { old: { x: 100, y: 90 }, new: { x: 100, y: 79 } },
    });
    expect(refusal(tooFar)).toContain('"move"');
    // Along the wrong axis: the height did not change, so no x shift is implied.
    const sideways = update(model, node, {
      size: { old: { width: 60, height: 20 }, new: { width: 80, height: 20 } },
      position: { old: { x: 100, y: 90 }, new: { x: 101, y: 90 } },
    });
    expect(refusal(sideways)).toContain('"move"');
    // A position change with no size change is a plain move.
    const plain = update(model, node, {
      position: { old: { x: 100, y: 90 }, new: { x: 100, y: 91 } },
    });
    expect(refusal(plain)).toContain('"move"');
  });

  it("a mirror of an odd-turn rotate-locked node is accepted, and so is its undo", () => {
    for (const axis of ["horizontal", "vertical"] as const) {
      const { model, node } = lockedNode({ rotate: false });
      const before = model.reader.getNode(node);
      expect(model.mirrorNodes([node], axis).status).toBe("accepted");
      expect(model.undo().status).toBe("accepted");
      expect(model.reader.getNode(node)).toEqual(before);
    }
  });

  it("a mirror toggle with any other rotation change needs rotate", () => {
    const { model, node } = lockedNode({ rotate: false });
    // From rotation 1 the mirror results are 3 (horizontal) and 1 (vertical).
    const result = update(model, node, {
      mirrored: { old: true, new: false },
      rotation: { old: 1, new: 2 },
    });
    expect(refusal(result)).toContain('"rotate"');
    // A rotation change without a mirror toggle is a plain rotation.
    expect(model.rotateNodes([node], 1).status).toBe("rejected");
  });
});
