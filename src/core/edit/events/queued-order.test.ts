import { describe, expect, it } from "vitest";
import { nodeId } from "../../base/ids/ids.js";
import { mkNode } from "../../data/model/test-helpers.js";
import { createGraphModel } from "../../graph-model.js";
import { createEventHub } from "./event-hub.js";

describe("a queued edit's events precede the next queued edit", () => {
  it("events a deferred job emits are delivered before the next deferred job runs", async () => {
    const hub = createEventHub();
    const log: string[] = [];
    hub.on("history", (e) => log.push(`event ${e.undoLabel}`));
    const job = (name: string) => () => {
      log.push(`job ${name}`);
      hub.emit("history", { canUndo: true, canRedo: false, undoLabel: name });
    };
    let jobs: Promise<void>[] = [];
    hub.dispatch(() => {
      jobs = [hub.defer(job("b"), () => {}), hub.defer(job("c"), () => {})];
    });
    await Promise.all(jobs);
    expect(log).toEqual(["job b", "event b", "job c", "event c"]);
  });

  it("a handler sees edit B applied and edit C not yet applied while it handles B", async () => {
    const model = createGraphModel();
    const seen: string[] = [];
    let queued: Promise<unknown>[] = [];
    model.on("change", (e) => {
      if (e.patch.ops.some((op) => op.op === "add" && op.record.id === "a")) {
        const add = (id: string) => {
          const r = model.submit({
            ops: [{ op: "add", entity: "node", record: mkNode(id) }],
          });
          return r.status === "queued" ? r.settled : Promise.resolve(r);
        };
        queued = [add("b"), add("c")];
        return;
      }
      const ids = model.reader.nodes().map((n) => n.id);
      seen.push(ids.join(","));
    });
    model.submit({ ops: [{ op: "add", entity: "node", record: mkNode("a") }] });
    await Promise.all(queued);
    expect(seen).toEqual(["a,b", "a,b,c"]);
    expect(model.reader.getNode(nodeId("c"))).toBeDefined();
  });
});
