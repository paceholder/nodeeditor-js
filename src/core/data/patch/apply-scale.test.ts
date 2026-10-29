import { describe, expect, it } from "vitest";
import { portId } from "../../base/ids/ids.js";
import { createGraphModel } from "../../graph-model.js";
import { mkConn, mkNode, mkPort } from "../model/test-helpers.js";
import type { PatchOp } from "./types.js";

/** A chain of `n` nodes with two ports each, joined by `n - 1` connections. */
function chainOps(n: number): PatchOp[] {
  const ops: PatchOp[] = [];
  for (let i = 0; i < n; i++) {
    ops.push({
      op: "add",
      entity: "node",
      record: mkNode(`n${i}`, { ports: [portId(`a${i}`), portId(`b${i}`)] }),
    });
    ops.push({ op: "add", entity: "port", record: mkPort(`a${i}`, `n${i}`) });
    ops.push({ op: "add", entity: "port", record: mkPort(`b${i}`, `n${i}`) });
  }
  for (let i = 0; i + 1 < n; i++) {
    ops.push({
      op: "add",
      entity: "connection",
      record: mkConn(`c${i}`, `n${i}`, `b${i}`, `n${i + 1}`, `a${i + 1}`),
    });
  }
  return ops;
}

describe("patch validation scales with patch size", () => {
  it("validates and applies a 10k-node, 40k-op patch without quadratic cost", () => {
    const model = createGraphModel();
    const ops = chainOps(10_000);
    const start = performance.now();
    const result = model.submit({ ops });
    const elapsed = performance.now() - start;
    expect(result.status).toBe("accepted");
    expect(model.reader.connections()).toHaveLength(9_999);
    // Linear cost is ~0.2 s here; the old quadratic overlay scan took over 10 s.
    expect(elapsed).toBeLessThan(3_000);
  });
});
