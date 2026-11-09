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

  it("exports the default generator and ID helpers", () => {
    const gen: IdGenerator = core.createCounterIdGenerator();
    expect(gen.next("node", core.EMPTY_CURSOR).id).toBe("n1");
    expect(core.isWellFormedId("n1")).toBe(true);
  });

  it("exports validation and results", () => {
    expect(core.validateNodeRecord(null).ok).toBe(false);
    expect(core.ok(1)).toEqual({ ok: true, value: 1 });
  });

  it("exports the model facade, patch helpers and adapter types", () => {
    const model = core.createGraphModel();
    const patch: core.Patch = { ops: [] };
    const result: core.SubmitResult = model.submit(patch);
    expect(result.status).toBe("accepted");
    expect(core.invertPatch(patch)).toEqual({ ops: [] });
    expect("createLocalAdapter" in core).toBe(false);
  });

  it("keeps the store internal", () => {
    expect("createGraphStore" in core).toBe(false);
    expect("createGraphReader" in core).toBe(false);
  });

  it("reader and record types are usable from the entry point", () => {
    const read = (r: GraphReader): GraphState => r.state();
    const first = (s: GraphState): NodeRecord | undefined => s.nodes[0];
    expect(typeof read).toBe("function");
    expect(typeof first).toBe("function");
  });

  it("export commands, registry, policy and capabilities", () => {
    const registry: core.NodeTypeRegistry = core.createNodeTypeRegistry();
    const policy: core.ConnectionPolicy = core.createDefaultConnectionPolicy();
    const model = core.createGraphModel({ registry, connectionPolicy: policy });
    const command: core.Command = { kind: "undo" };
    expect(model.can(command).available).toBe(false);
    expect(core.defaultLimit("input")).toBe(1);
    expect(typeof core.resolveCapability).toBe("function");
    expect(core.findUnknownTypes(model.reader, registry)).toEqual([]);
  });

  it("exports the keyed policy alternative", () => {
    const alt: core.ConnectionAlternative = {
      key: "fast",
      label: "Fast",
      from: { node: core.nodeId("n1"), port: core.portId("p1") },
      to: { node: core.nodeId("n2"), port: core.portId("p2") },
      connectionKind: "fast",
      auxiliary: [],
    };
    const proposal: core.ConnectionProposal = { ...alt, choice: alt.key };
    expect(proposal.choice).toBe("fast");
  });
});

describe("snapshot API on the core entry", () => {
  it("exposes the snapshot functions and constants", () => {
    expect(core.FORMAT_VERSION).toBe(1);
    for (const fn of [
      core.validateSnapshot,
      core.exportSnapshot,
      core.loadSnapshot,
      core.saveDocument,
      core.loadDocument,
      core.diffSnapshot,
    ]) {
      expect(typeof fn).toBe("function");
    }
  });
});

describe("clipboard fragment API on the core entry", () => {
  it("exposes extraction, the text form and the marker", () => {
    for (const fn of [
      core.extractFragment,
      core.fragmentToText,
      core.parseFragmentText,
      core.parseFragmentValue,
    ]) {
      expect(typeof fn).toBe("function");
    }
    expect(core.FRAGMENT_FORMAT).toBe("@paceholder/nodeeditor-js/fragment");
    expect(core.FRAGMENT_VERSION).toBe(1);
    const placement: core.Placement = { kind: "offset", by: { x: 1, y: 1 } };
    const excluded: core.ExcludedReference[] = [];
    const fragment: core.ClipboardFragment | undefined = undefined;
    expect([placement.kind, excluded, fragment]).toEqual([
      "offset",
      [],
      undefined,
    ]);
  });
});

describe("resize and mirror API on the core entry", () => {
  it("exposes anchored resizing, size limits and the mirror axis", () => {
    const fixed: core.ResizeFixed = { x: -1, y: 1 };
    const limits: core.SizeLimits = { min: { width: 5, height: 5 } };
    const hook: core.SizeLimitPolicy = () => limits;
    const resolved: core.ResolvedSizeLimits = core.DEFAULT_SIZE_LIMITS;
    const axis: core.MirrorAxis = "vertical";
    expect(
      core.anchoredPosition(
        {
          position: { x: 0, y: 0 },
          size: { width: 10, height: 10 },
          rotation: 0,
          mirrored: false,
        },
        { width: 20, height: 10 },
        fixed,
      ),
    ).toEqual({ x: 5, y: 0 });
    expect(resolved.min).toEqual({ width: 1, height: 1 });
    expect([typeof hook, axis]).toEqual(["function", "vertical"]);
  });
});
