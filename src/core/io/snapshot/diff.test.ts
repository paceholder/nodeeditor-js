import { describe, expect, it } from "vitest";
import { nodeId } from "../../base/ids/ids.js";
import { invertPatch } from "../../data/patch/invert.js";
import type { Patch } from "../../data/patch/types.js";
import { exportSnapshot } from "./export.js";
import { loadSnapshot } from "./load.js";
import type { GraphSnapshot } from "./snapshot-types.js";
import {
  canonical,
  diffOk as diffSnapshot,
  loadedModel,
  makeTestModel,
  nodesOf,
  portsOf,
  randomGraph,
  rng,
  target,
} from "./test-kit.js";
import { validateSnapshot } from "./validate.js";

describe("snapshot diff against the read model", () => {
  it("gives an empty patch for a snapshot exported from the same model", () => {
    const model = loadedModel();
    expect(diffSnapshot(model.reader, exportSnapshot(model)).ops).toEqual([]);
  });

  it("gives exactly one update with old and new position for a moved node", () => {
    const model = loadedModel();
    const patch = diffSnapshot(
      model.reader,
      target((s) => {
        nodesOf(s)[0] = { ...nodesOf(s)[0], position: { x: 5, y: 6 } };
      }),
    );
    expect(patch.ops).toEqual([
      {
        op: "update",
        entity: "node",
        id: "n1",
        fields: { position: { old: { x: 0, y: 0 }, new: { x: 5, y: 6 } } },
      },
    ]);
  });

  it("removes with record and seq, and adds new entities", () => {
    const model = loadedModel();
    const patch = diffSnapshot(
      model.reader,
      target((s) => {
        s.connections = [];
        nodesOf(s).splice(1, 1);
        nodesOf(s).push({
          id: "n5",
          type: "pipe",
          position: { x: 1, y: 1 },
          size: { width: 1, height: 1 },
          ports: [{ id: "p9", direction: "undirected", typeKey: "hydraulic" }],
          payload: { a: 1 },
        });
      }),
    );
    expect(patch.ops.map((o) => `${o.op}:${o.entity}`)).toEqual([
      "remove:connection",
      "remove:port",
      "remove:node",
      "add:node",
      "add:port",
    ]);
    const removal = patch.ops[2];
    expect(removal?.op === "remove" && removal.seq).toBe(
      model.reader.seqOf(nodeId("n2")),
    );
    expect(model.submit(patch).status).toBe("accepted");
    expect(model.reader.getNode(nodeId("n5"))?.payload).toEqual({ a: 1 });
  });
});

describe("diff property", () => {
  it("applying diff(a, b) exports b, and undo restores a exactly (200 seeded pairs)", () => {
    const next = rng(20261029);
    for (let i = 0; i < 200; i += 1) {
      const a = randomGraph(next);
      const b = randomGraph(next);
      const checkedA = validateSnapshot(a);
      const checkedB = validateSnapshot(b);
      expect(checkedA.ok && checkedB.ok).toBe(true);
      if (!checkedA.ok || !checkedB.ok) return;
      const model = makeTestModel();
      expect(loadSnapshot(model, checkedA.value).ok).toBe(true);
      const before = exportSnapshot(model, { fragment: true });
      const patch = diffSnapshot(model.reader, checkedB.value);
      const result = model.submit(patch);
      expect(result.status, `pair ${i}`).toBe("accepted");
      expect(
        canonical(exportSnapshot(model, { fragment: true })),
        `pair ${i}`,
      ).toEqual(canonical(checkedB.value));
      expect(
        diffSnapshot(model.reader, checkedB.value).ops,
        `pair ${i} idempotent`,
      ).toEqual([]);
      if (patch.ops.length > 0) {
        expect(model.undo().status).toBe("accepted");
        expect(
          exportSnapshot(model, { fragment: true }),
          `pair ${i} undo`,
        ).toEqual(before);
      }
    }
  });

  it("moves a port to another node as remove plus add", () => {
    const model = loadedModel();
    const patch = diffSnapshot(
      model.reader,
      target((s) => {
        const n = nodesOf(s);
        const moved = portsOf(n[0]).slice(0, 1);
        n[0] = { ...n[0], ports: portsOf(n[0]).slice(1) };
        n[1] = { ...n[1], ports: [...portsOf(n[1]), ...moved] };
        s.connections = [];
      }),
    );
    expect(model.submit(patch).status).toBe("accepted");
    expect(model.reader.getPort("p1" as never)?.node).toBe("n2");
  });
});

/** Three pipes in a row, the middle one connected to both neighbours. */
function chain(): Record<string, unknown> {
  const pipe = (id: string, x: number) => ({
    id,
    type: "pipe",
    position: { x, y: 0 },
    size: { width: 40, height: 20 },
    ports: [
      { id: `${id}a`, direction: "undirected", typeKey: "hydraulic" },
      { id: `${id}b`, direction: "undirected", typeKey: "hydraulic" },
    ],
    payload: null,
  });
  return {
    format: "@paceholder/nodeeditor-js/graph",
    version: 1,
    nodes: [pipe("n1", 0), pipe("n2", 100), pipe("n3", 200)],
    connections: [
      {
        id: "c1",
        from: { node: "n1", port: "n1b" },
        to: { node: "n2", port: "n2a" },
      },
      {
        id: "c2",
        from: { node: "n2", port: "n2b" },
        to: { node: "n3", port: "n3a" },
      },
    ],
  };
}

function chainWithout(node: string): GraphSnapshot {
  const raw = chain();
  raw.nodes = nodesOf(raw).filter((n) => n.id !== node);
  raw.connections = [];
  const checked = validateSnapshot(raw);
  if (!checked.ok) throw new Error(JSON.stringify(checked.rejection));
  return checked.value;
}

describe("snapshot diff against the read model, deterministic ordering and inverse patches", () => {
  it("removes a dropped node's two connections, its ports and the node in one atomic patch", () => {
    const model = loadedModel(chain());
    const patch = diffSnapshot(model.reader, chainWithout("n2"));
    expect(
      patch.ops.map((o) => `${o.op}:${o.op === "update" ? o.id : o.record.id}`),
    ).toEqual([
      "remove:c1",
      "remove:c2",
      "remove:n2a",
      "remove:n2b",
      "remove:n2",
    ]);
    expect(model.submit(patch).status).toBe("accepted");
    expect(model.reader.connections()).toEqual([]);
    expect(model.reader.ports().map((p) => p.id)).toEqual([
      "n1a",
      "n1b",
      "n3a",
      "n3b",
    ]);
  });

  it("applying the diff reaches the snapshot, and its inverse restores the previous export", () => {
    const model = loadedModel(chain());
    const before = exportSnapshot(model, { fragment: true });
    const raw = chain();
    nodesOf(raw)[1] = {
      ...nodesOf(raw)[1],
      title: "B",
      position: { x: 9, y: 9 },
    };
    raw.nodes = [
      ...nodesOf(raw).filter((n) => n.id !== "n3"),
      { ...nodesOf(raw)[2], id: "n4", ports: [] },
    ];
    raw.connections = [(raw.connections as unknown[])[0]];
    const checked = validateSnapshot(raw);
    if (!checked.ok) throw new Error(JSON.stringify(checked.rejection));
    const wanted = checked.value;
    const applied: Patch[] = [];
    model.on("change", (event) => applied.push(event.patch));
    const patch = diffSnapshot(model.reader, wanted);
    expect(model.submit(patch, { history: "skip" }).status).toBe("accepted");
    expect(canonical(exportSnapshot(model, { fragment: true }))).toEqual(
      canonical(wanted),
    );
    const [done] = applied;
    if (!done) throw new Error("no change");
    expect(model.submit(invertPatch(done), { history: "skip" }).status).toBe(
      "accepted",
    );
    expect(exportSnapshot(model, { fragment: true })).toEqual(before);
  });

  it("gives identical plain-data output across two runs and two equal models", () => {
    const next = rng(20261111);
    for (let i = 0; i < 50; i += 1) {
      const a = validateSnapshot(randomGraph(next));
      const b = validateSnapshot(randomGraph(next));
      if (!a.ok || !b.ok) throw new Error("random graph is invalid");
      const one = makeTestModel();
      const two = makeTestModel();
      expect(
        loadSnapshot(one, a.value).ok && loadSnapshot(two, a.value).ok,
      ).toBe(true);
      const first = diffSnapshot(one.reader, b.value);
      expect(diffSnapshot(one.reader, b.value), `pair ${i}`).toEqual(first);
      expect(
        JSON.stringify(diffSnapshot(two.reader, b.value)),
        `pair ${i}`,
      ).toBe(JSON.stringify(first));
      expect(JSON.parse(JSON.stringify(first)), `pair ${i} plain`).toEqual(
        first,
      );
    }
  });
});
