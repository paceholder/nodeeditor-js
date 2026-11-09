import { describe, expect, it } from "vitest";
import { mkNode } from "../../data/model/test-helpers.js";
import type { ChangeEvent } from "../../edit/events/types.js";
import { createGraphModel } from "../../graph-model.js";
import * as core from "../../index.js";
import { MisuseError } from "../result.js";

describe("operation ID constructor", () => {
  it("the core entry builds an operation ID a submit carries to its outcome and change event", () => {
    const model = createGraphModel();
    const events: ChangeEvent[] = [];
    model.on("change", (e) => events.push(e));
    const result = model.submit(
      { ops: [{ op: "add", entity: "node", record: mkNode("n1") }] },
      {
        operationId: core.operationId("save-1"),
        baseRevision: model.revision(),
      },
    );
    expect(result).toMatchObject({ status: "accepted", operationId: "save-1" });
    expect(events[0]?.operationId).toBe("save-1");
  });

  it("throws a misuse error for an empty ID or one containing whitespace", () => {
    expect(() => core.operationId("")).toThrow(MisuseError);
    expect(() => core.operationId("save 1")).toThrow(MisuseError);
    expect(() => core.operationId(undefined as unknown as string)).toThrow(
      MisuseError,
    );
  });
});
