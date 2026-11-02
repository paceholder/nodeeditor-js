import { describe, expect, it } from "vitest";
import { nodeId } from "../../base/ids/ids.js";
import { diffSnapshot } from "./diff.js";
import { exportSnapshot } from "./export.js";
import type { JsonValue } from "./json-value.js";
import { loadSnapshot } from "./load.js";
import type { GraphSnapshot, NodeSnapshot } from "./snapshot-types.js";
import { loadedModel, makeTestModel, sampleSnapshot } from "./test-kit.js";
import { validateSnapshot } from "./validate.js";

function target(mutate: (s: Record<string, unknown>) => void): GraphSnapshot {
  const raw = sampleSnapshot();
  mutate(raw);
  const checked = validateSnapshot(raw);
  if (!checked.ok) throw new Error(JSON.stringify(checked.error));
  return checked.value;
}

const portsOf = (n: Record<string, unknown> | undefined): unknown[] =>
  (n?.ports as unknown[] | undefined) ?? [];

const nodesOf = (s: Record<string, unknown>) =>
  s.nodes as Record<string, unknown>[];

describe("ADP-05 / PAT-01 diffSnapshot", () => {
  it("gives an empty patch for identical state", () => {
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

describe("MOD-08 / CON-08 diff details", () => {
  it("turns port order and z differences into node field updates", () => {
    const model = loadedModel();
    const patch = diffSnapshot(
      model.reader,
      target((s) => {
        const n = nodesOf(s);
        const ports = [...portsOf(n[0])].reverse();
        n[0] = { ...n[0], ports, z: 4 };
      }),
    );
    expect(patch.ops).toHaveLength(1);
    const op = patch.ops[0];
    expect(
      op?.op === "update" &&
        op.entity === "node" &&
        Object.keys(op.fields).sort(),
    ).toEqual(["ports", "z"]);
    expect(model.submit(patch).status).toBe("accepted");
    expect(model.reader.getNode(nodeId("n1"))?.ports).toEqual(["p2", "p1"]);
    expect(model.reader.paintOrder().at(-1)?.id).toBe("n1");
  });

  it("updates a changed endpoint in place, keeping the connection ID", () => {
    const model = loadedModel();
    const seq = model.reader.seqOf("c1" as never);
    const patch = diffSnapshot(
      model.reader,
      target((s) => {
        (s.connections as Record<string, unknown>[])[0] = {
          id: "c1",
          from: { node: "n1", port: "p1" },
          to: { node: "n2", port: "p3" },
        };
      }),
    );
    expect(patch.ops).toEqual([
      {
        op: "update",
        entity: "connection",
        id: "c1",
        fields: {
          from: {
            old: { node: "n1", port: "p2" },
            new: { node: "n1", port: "p1" },
          },
        },
      },
    ]);
    expect(model.submit(patch).status).toBe("accepted");
    expect(model.reader.seqOf("c1" as never)).toBe(seq);
  });

  it("handles removing the port a connection used, in one atomic patch", () => {
    const model = loadedModel();
    const patch = diffSnapshot(
      model.reader,
      target((s) => {
        const n = nodesOf(s);
        n[0] = { ...n[0], ports: [portsOf(n[0])[0]] };
        s.connections = [];
      }),
    );
    expect(model.submit(patch).status).toBe("accepted");
    expect(model.reader.ports().map((p) => p.id)).toEqual(["p1", "p3"]);
  });
});

function rng(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A random graph that passes the default connection policy (undirected, one type). */
function randomGraph(next: () => number): GraphSnapshot {
  const int = (n: number) => Math.floor(next() * n);
  const pool = ["n1", "n2", "n3", "n4", "n5", "n6"].filter(() => next() < 0.7);
  const nodes: NodeSnapshot[] = pool.map((id) => ({
    id,
    type: next() < 0.5 ? "pipe" : "other",
    position: { x: int(5), y: int(5) },
    size: { width: 10, height: 10 },
    ...(next() < 0.5 ? { rotation: (1 + int(3)) as 0 | 1 | 2 | 3 } : {}),
    ...(next() < 0.3 ? { mirrored: true } : {}),
    ...(next() < 0.5 ? { z: 1 + int(2) } : {}),
    ...(next() < 0.4 ? { title: `t${int(3)}` } : {}),
    ports: Array.from({ length: int(4) }, (_, k) => k)
      .filter(() => next() < 0.9)
      .map((k) => ({
        id: `${id}p${k}`,
        direction: "undirected" as const,
        typeKey: "t",
      }))
      .sort(() => next() - 0.5),
    payload: (next() < 0.5 ? { v: int(3), l: [int(2)] } : null) as JsonValue,
  }));
  const ends = nodes.flatMap((n) =>
    n.ports.map((p) => ({ node: n.id, port: p.id })),
  );
  const connections: GraphSnapshot["connections"][number][] = [];
  const pairs = new Set<string>();
  for (let i = 1; i <= 6 && ends.length > 1; i += 1) {
    if (next() < 0.4) continue;
    const from = ends[int(ends.length)];
    const to = ends[int(ends.length)];
    if (!from || !to || from.node === to.node) continue;
    const key = [from.port, to.port].sort().join("|");
    if (pairs.has(key)) continue;
    pairs.add(key);
    connections.push({ id: `c${i}`, from, to });
  }
  return { format: "nodeeditor-js/graph", version: 1, nodes, connections };
}

/** Compare ignoring `seq`-derived order of equal entities and the cursor. */
function canonical(s: GraphSnapshot) {
  const byId = <T extends { id: string }>(xs: readonly T[]) =>
    [...xs].sort((a, b) => a.id.localeCompare(b.id));
  return { nodes: byId(s.nodes), connections: byId(s.connections) };
}

describe("ADP-05 / PAT-03 diff property", () => {
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

describe("ROU-03a diffSnapshot route", () => {
  it("emits a route update with old and new values", () => {
    const model = loadedModel();
    const route = [{ kind: "segment", orientation: "vertical", at: 7 }];
    const patch = diffSnapshot(
      model.reader,
      target((s) => {
        const c = s.connections as Record<string, unknown>[];
        c[0] = { ...c[0], route };
      }),
    );
    expect(patch.ops).toEqual([
      {
        op: "update",
        entity: "connection",
        id: "c1",
        fields: { route: { new: route } },
      },
    ]);
  });
});
