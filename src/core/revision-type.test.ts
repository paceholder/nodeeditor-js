import { describe, expect, it } from "vitest";
import { mkNode } from "./data/model/test-helpers.js";
import type { ChangeEvent, ResetEvent } from "./edit/events/types.js";
import { createGraphModel } from "./graph-model.js";
import { loadSnapshot } from "./io/snapshot/load.js";
import {
  FORMAT_VERSION,
  SNAPSHOT_FORMAT,
} from "./io/snapshot/snapshot-types.js";

describe("one revision type", () => {
  it("the outcome, the change event, the model and the reader agree on one integer", () => {
    const model = createGraphModel();
    expect(model.revision()).toBe(0);
    expect(model.reader.revision()).toBe(0);
    const events: ChangeEvent[] = [];
    model.on("change", (e) => events.push(e));
    const result = model.submit({
      ops: [{ op: "add", entity: "node", record: mkNode("n1") }],
    });
    if (result.status !== "accepted") throw new Error(result.status);
    expect(result.revision).toBe(1);
    expect(events[0]?.revision).toBe(result.revision);
    expect(model.revision()).toBe(result.revision);
    expect(model.reader.revision()).toBe(result.revision);
    expect(model.reader.state().revision).toBe(result.revision);
  });

  it("a snapshot load reports the same integer as the reset event and the reader", () => {
    const model = createGraphModel();
    const resets: ResetEvent[] = [];
    model.on("reset", (e) => resets.push(e));
    const loaded = loadSnapshot(model, {
      format: SNAPSHOT_FORMAT,
      version: FORMAT_VERSION,
      nodes: [],
      connections: [],
    });
    if (!loaded.ok) throw new Error(JSON.stringify(loaded.rejection));
    expect(typeof loaded.value.revision).toBe("number");
    expect(resets[0]?.revision).toBe(loaded.value.revision);
    expect(model.reader.revision()).toBe(loaded.value.revision);
  });
});
