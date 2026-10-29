import { describe, expect, it } from "vitest";
import type {
  GraphReader,
  GraphState,
  IdGenerator,
  NodeRecord,
} from "./index.js";
import * as core from "./index.js";

describe("core entry", () => {
  it("is importable in Node without browser globals", () => {
    expect(core.FORMAT_VERSION).toBe(1);
  });

  it("MOD-03a exports the default generator and ID helpers", () => {
    const gen: IdGenerator = core.createCounterIdGenerator();
    expect(gen.next("node", core.EMPTY_CURSOR).id).toBe("n1");
    expect(core.isWellFormedId("n1")).toBe(true);
  });

  it("MOD-09 exports validation and results", () => {
    expect(core.validateNodeRecord(null).ok).toBe(false);
    expect(core.ok(1)).toEqual({ ok: true, value: 1 });
  });

  it("keeps the store internal", () => {
    expect("createGraphStore" in core).toBe(false);
    expect("createGraphReader" in core).toBe(false);
  });

  it("MOD-01 reader and record types are usable from the entry point", () => {
    const read = (r: GraphReader): GraphState => r.state();
    const first = (s: GraphState): NodeRecord | undefined => s.nodes[0];
    expect(typeof read).toBe("function");
    expect(typeof first).toBe("function");
  });
});
