import { describe, expect, it } from "vitest";
import { mkNode } from "../../data/model/test-helpers.js";
import { createGraphModel } from "../../graph-model.js";
import type { SubmitResult } from "./types.js";

describe("queued undo and redo report their own operation ID", () => {
  for (const kind of ["undo", "redo"] as const) {
    it(`a ${kind} queued from a handler settles and commits with the ID it returned`, async () => {
      const model = createGraphModel();
      model.submit({
        ops: [{ op: "add", entity: "node", record: mkNode("a") }],
      });
      if (kind === "redo") model.undo();
      let queued: SubmitResult | undefined;
      const changeIds: string[] = [];
      model.on("change", (e) => {
        changeIds.push(e.operationId);
        if (!queued) queued = kind === "undo" ? model.undo() : model.redo();
      });
      model.submit(
        { ops: [{ op: "add", entity: "node", record: mkNode("b") }] },
        { history: "skip" },
      );
      if (queued?.status !== "queued") throw new Error("expected queued");
      const settled = await queued.settled;
      expect(settled.operationId).toBe(queued.operationId);
      expect(changeIds.at(-1)).toBe(queued.operationId);
    });
  }
});
