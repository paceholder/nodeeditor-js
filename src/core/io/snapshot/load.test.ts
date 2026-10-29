import { describe, expect, it } from "vitest";
import { nodeId } from "../../base/ids/ids.js";
import type { ResetEvent } from "../../edit/events/types.js";
import { exportSnapshot } from "./export.js";
import { loadSnapshot } from "./load.js";
import { loadedModel, makeTestModel, sampleSnapshot } from "./test-kit.js";

describe("SNP-03 / MOD-05 load", () => {
  it("a loaded fresh model answers entity and adjacency queries like the source", () => {
    const source = loadedModel();
    const target = makeTestModel();
    expect(loadSnapshot(target, exportSnapshot(source)).ok).toBe(true);
    expect(target.reader.nodes()).toEqual(source.reader.nodes());
    expect(target.reader.ports()).toEqual(source.reader.ports());
    expect(target.reader.connections()).toEqual(source.reader.connections());
    expect(target.reader.paintOrder().map((n) => n.id)).toEqual(
      source.reader.paintOrder().map((n) => n.id),
    );
    const n1 = nodeId("n1");
    expect(target.reader.neighbors(n1)).toEqual(source.reader.neighbors(n1));
    expect(target.reader.connectionsOfNode(n1)).toEqual(
      source.reader.connectionsOfNode(n1),
    );
    expect(exportSnapshot(target)).toEqual(exportSnapshot(source));
  });

  it("replaces the previous document, clears history and emits one reset", () => {
    const model = loadedModel();
    model.moveNodes([{ node: nodeId("n1"), position: { x: 9, y: 9 } }]);
    expect(model.historyState().canUndo).toBe(true);
    const events: string[] = [];
    const resets: ResetEvent[] = [];
    model.on("reset", (e) => {
      resets.push(e);
      events.push("reset");
    });
    model.on("change", () => events.push("change"));
    const next = { ...sampleSnapshot(), nodes: [], connections: [] };
    const result = loadSnapshot(model, next);
    expect(result.ok).toBe(true);
    expect(model.reader.nodes()).toEqual([]);
    expect(model.reader.connections()).toEqual([]);
    expect(model.historyState().canUndo).toBe(false);
    expect(events).toEqual(["reset"]);
    expect(resets[0]?.origin).toBe("local");
    expect(model.undo().status).toBe("rejected");
  });

  it("does not freeze or retain the caller's input objects", () => {
    const input = sampleSnapshot();
    const model = makeTestModel();
    loadSnapshot(model, input);
    const payload = (input.nodes as { payload: object }[])[0]?.payload;
    expect(Object.isFrozen(payload)).toBe(false);
    expect(model.reader.getNode(nodeId("n1"))?.payload).not.toBe(payload);
  });
});

describe("SER-04 failed load", () => {
  it("leaves document, history and listeners untouched", () => {
    const model = loadedModel();
    model.moveNodes([{ node: nodeId("n1"), position: { x: 9, y: 9 } }]);
    const before = JSON.stringify(exportSnapshot(model));
    const revision = model.revision();
    const seen: string[] = [];
    model.on("reset", () => seen.push("reset"));
    model.on("change", () => seen.push("change"));
    model.on("history", () => seen.push("history"));
    const bad = sampleSnapshot();
    (bad.nodes as Record<string, unknown>[])[1] = { id: "n1" };
    const result = loadSnapshot(model, bad);
    expect(result.ok).toBe(false);
    expect(JSON.stringify(exportSnapshot(model))).toBe(before);
    expect(model.revision()).toBe(revision);
    expect(model.historyState().canUndo).toBe(true);
    expect(seen).toEqual([]);
  });
});

describe("SER-05 / NOD-07 unregistered types", () => {
  it("loads them with diagnostics, not errors, and re-exports payloads unchanged", () => {
    const input = sampleSnapshot();
    const nodes = input.nodes as Record<string, unknown>[];
    nodes[0] = {
      ...nodes[0],
      type: "vendor/unknown",
      payload: { z: 1, a: [true, { y: null }] },
    };
    const model = makeTestModel();
    const result = loadSnapshot(model, input);
    expect(result.ok && result.value.diagnostics).toEqual([
      {
        code: "unresolved-type",
        node: "n1",
        type: "vendor/unknown",
        path: "nodes[0]",
      },
    ]);
    const out = exportSnapshot(model).nodes.find((n) => n.id === "n1");
    expect(out?.type).toBe("vendor/unknown");
    expect(JSON.stringify(out?.payload)).toBe(
      JSON.stringify({ z: 1, a: [true, { y: null }] }),
    );
  });

  it("reports every node when no type is registered", () => {
    const model = makeTestModel(false);
    const result = loadSnapshot(model, sampleSnapshot());
    expect(result.ok && result.value.diagnostics).toHaveLength(2);
  });
});

describe("MOD-03a ID cursor reconciliation", () => {
  it("keeps retired IDs retired after a save and load", () => {
    const model = loadedModel();
    model.createNode("pipe", { x: 0, y: 0 });
    const created = model.reader.nodes().at(-1);
    expect(created?.id).toBe("n3");
    model.deleteEntities({ nodes: [created?.id as never] });
    const snapshot = exportSnapshot(model);
    expect(snapshot.nodes.some((n) => n.id === "n3")).toBe(false);
    const fresh = makeTestModel();
    loadSnapshot(fresh, snapshot);
    fresh.createNode("pipe", { x: 0, y: 0 });
    expect(fresh.reader.nodes().at(-1)?.id).toBe("n4");
  });

  it("advances past a hand-edited ID that is beyond the cursor", () => {
    const input = sampleSnapshot();
    input.idCursor = { n: 9 };
    const nodes = input.nodes as Record<string, unknown>[];
    nodes[1] = { ...nodes[1], id: "n12" };
    (input.connections as Record<string, unknown>[])[0] = {
      id: "c1",
      from: { node: "n1", port: "p2" },
      to: { node: "n12", port: "p3" },
    };
    const model = makeTestModel();
    expect(loadSnapshot(model, input).ok).toBe(true);
    model.createNode("pipe", { x: 0, y: 0 });
    const id = model.reader.nodes().at(-1)?.id;
    expect(id).toBe("n13");
    expect(model.idCursor()).toMatchObject({ n: 13 });
  });

  it("replaces a larger cursor from the previous document with the loaded one", () => {
    const model = loadedModel();
    for (let i = 0; i < 5; i += 1) model.createNode("pipe", { x: 0, y: 0 });
    loadSnapshot(model, sampleSnapshot());
    expect(model.idCursor()).toEqual({ c: 1, n: 2, p: 3 });
  });
});
