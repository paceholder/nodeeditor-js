import { describe, expect, it } from "vitest";
import { nodeId } from "../../base/ids/ids.js";
import { mkNode } from "../../data/model/test-helpers.js";
import type { Patch } from "../../data/patch/types.js";
import { createGraphModel } from "../../graph-model.js";
import type { SubmitResult } from "./types.js";

const add = (id: string): Patch => ({
  ops: [{ op: "add", entity: "node", record: mkNode(id) }],
});

describe("base revision is checked by the local adapter", () => {
  it("rejects a patch planned against an older revision with stale-revision and changes nothing", () => {
    const model = createGraphModel();
    const seen = model.revision();
    model.submit(add("n1"));
    const failures: string[] = [];
    model.on("failure", (f) => {
      if (f.source === "rejection") failures.push(f.rejection.code);
    });
    const before = model.reader.state();
    const history = model.historyState();

    const result = model.submit(add("n2"), { baseRevision: seen });

    expect(result).toMatchObject({
      ok: false,
      status: "rejected",
      rejection: { code: "stale-revision" },
    });
    expect(model.reader.getNode(nodeId("n2"))).toBeUndefined();
    expect(model.reader.state()).toBe(before);
    expect(model.historyState()).toEqual(history);
    expect(failures).toEqual(["stale-revision"]);
  });

  it("rejects a base revision the model has not reached", () => {
    const model = createGraphModel();
    const result = model.submit(add("n1"), {
      baseRevision: model.revision() + 1,
    });
    expect(result).toMatchObject({ rejection: { code: "stale-revision" } });
  });

  it("accepts a patch planned against the current revision", () => {
    const model = createGraphModel();
    model.submit(add("n1"));
    const result = model.submit(add("n2"), { baseRevision: model.revision() });
    expect(result.status).toBe("accepted");
  });

  it("uses the current revision when the caller gives none", () => {
    const model = createGraphModel();
    model.submit(add("n1"));
    expect(model.submit(add("n2")).status).toBe("accepted");
  });

  it("never refuses undo or redo for a stale base revision", () => {
    const model = createGraphModel();
    model.submit(add("n1"));
    model.submit(add("n2"));
    expect(model.undo().status).toBe("accepted");
    expect(model.undo().status).toBe("accepted");
    expect(model.redo().status).toBe("accepted");
  });
});

describe("queued submissions are checked when submitted", () => {
  it("two edits queued from one handler with the revision they saw are both applied", async () => {
    const model = createGraphModel();
    const queued: SubmitResult[] = [];
    let once = false;
    model.on("change", () => {
      if (once) return;
      once = true;
      const base = model.revision();
      queued.push(model.submit(add("n2"), { baseRevision: base }));
      queued.push(model.submit(add("n3"), { baseRevision: base }));
    });
    model.submit(add("n1"));
    const settled = await Promise.all(
      queued.map((r) =>
        r.status === "queued" || r.status === "pending" ? r.settled : r,
      ),
    );
    expect(settled.map((r) => r.status)).toEqual(["accepted", "accepted"]);
    expect(model.reader.nodes().map((n) => n.id)).toEqual(["n1", "n2", "n3"]);
  });

  it("a queued edit with a stale base revision is rejected without being applied", async () => {
    const model = createGraphModel();
    const stale = model.revision();
    model.submit(add("n1"));
    let result: SubmitResult | undefined;
    let once = false;
    model.on("change", () => {
      if (once) return;
      once = true;
      result = model.submit(add("n3"), { baseRevision: stale });
    });
    model.submit(add("n2"));
    const outcome =
      result && (result.status === "queued" || result.status === "pending")
        ? await result.settled
        : result;
    expect(outcome).toMatchObject({ rejection: { code: "stale-revision" } });
    expect(model.reader.getNode(nodeId("n3"))).toBeUndefined();
  });
});
