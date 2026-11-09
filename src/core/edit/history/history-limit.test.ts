import { describe, expect, it } from "vitest";
import { MisuseError } from "../../base/result.js";
import { mkNode } from "../../data/model/test-helpers.js";
import { createGraphModel } from "../../graph-model.js";

const add = (model: ReturnType<typeof createGraphModel>, id: string) =>
  model.submit({ ops: [{ op: "add", entity: "node", record: mkNode(id) }] });

describe("local history size limit", () => {
  it("with a limit of two, the oldest of three entries is dropped", () => {
    const model = createGraphModel({ historyLimit: 2 });
    for (const id of ["a", "b", "c"]) add(model, id);
    expect(model.undo().status).toBe("accepted");
    expect(model.undo().status).toBe("accepted");
    const third = model.undo();
    expect(third.status === "rejected" && third.rejection.code).toBe(
      "history-unavailable",
    );
    expect(model.reader.nodes().map((n) => n.id)).toEqual(["a"]);
  });

  it("without a limit every entry is kept", () => {
    const model = createGraphModel();
    for (let i = 0; i < 50; i++) add(model, `n${i + 1}`);
    for (let i = 0; i < 50; i++) expect(model.undo().status).toBe("accepted");
  });

  it("a limit that is not a positive integer is misuse", () => {
    for (const historyLimit of [0, -1, 1.5, Number.NaN]) {
      expect(() => createGraphModel({ historyLimit })).toThrow(MisuseError);
    }
  });
});
