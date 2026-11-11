/** Fixtures shared by snapshot tests. */

import { createNodeTypeRegistry } from "../../data/node-types/registry.js";
import { createGraphModel, type GraphModel } from "../../graph-model.js";
import { diffSnapshot } from "./diff.js";
import type { JsonValue } from "./json-value.js";
import { loadSnapshot } from "./load.js";
import type { GraphSnapshot, NodeSnapshot } from "./snapshot-types.js";
import { validateSnapshot } from "./validate.js";

/** A small valid snapshot as untrusted-looking plain data. */
export function sampleSnapshot(): Record<string, unknown> {
  return {
    format: "@paceholder/nodeeditor-js/graph",
    version: 1,
    idCursor: { c: 1, n: 2, p: 3 },
    nodes: [
      {
        id: "n1",
        type: "pipe",
        position: { x: 0, y: 0 },
        size: { width: 40, height: 20 },
        title: "A",
        ports: [
          { id: "p1", direction: "undirected", typeKey: "hydraulic" },
          { id: "p2", direction: "undirected", typeKey: "hydraulic" },
        ],
        payload: { length: 2, tags: ["x"] },
      },
      {
        id: "n2",
        type: "pipe",
        position: { x: 100, y: 0 },
        size: { width: 40, height: 20 },
        z: 1,
        rotation: 1,
        ports: [{ id: "p3", direction: "undirected", typeKey: "hydraulic" }],
        payload: null,
      },
    ],
    connections: [
      {
        id: "c1",
        from: { node: "n1", port: "p2" },
        to: { node: "n2", port: "p3" },
      },
    ],
  };
}

export function makeTestModel(registerPipe = true): GraphModel {
  const registry = createNodeTypeRegistry();
  if (registerPipe) {
    registry.register({
      type: "pipe",
      label: "Pipe",
      defaultSize: { width: 40, height: 20 },
      ports: () => [],
    });
  }
  return createGraphModel({ registry });
}

export function loadedModel(
  input: unknown = sampleSnapshot(),
  registerPipe = true,
): GraphModel {
  const model = makeTestModel(registerPipe);
  const result = loadSnapshot(model, input);
  if (!result.ok)
    throw new Error(`fixture failed: ${JSON.stringify(result.rejection)}`);
  return model;
}

/** The sample snapshot after `mutate`, validated. */
export function target(
  mutate: (s: Record<string, unknown>) => void,
): GraphSnapshot {
  const raw = sampleSnapshot();
  mutate(raw);
  const checked = validateSnapshot(raw);
  if (!checked.ok) throw new Error(JSON.stringify(checked.rejection));
  return checked.value;
}

export const portsOf = (n: Record<string, unknown> | undefined): unknown[] =>
  (n?.ports as unknown[] | undefined) ?? [];

/** The patch of a diff that cannot fail (no codecs). */
export const diffOk = (...args: Parameters<typeof diffSnapshot>) => {
  const r = diffSnapshot(...args);
  if (!r.ok) throw new Error(JSON.stringify(r.rejection));
  return r.value;
};

export const nodesOf = (s: Record<string, unknown>) =>
  s.nodes as Record<string, unknown>[];

/** Seeded random number source in [0, 1). */
export function rng(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A random graph that passes the default connection policy (undirected, one type). */
export function randomGraph(next: () => number): GraphSnapshot {
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
  return {
    format: "@paceholder/nodeeditor-js/graph",
    version: 1,
    nodes,
    connections,
  };
}

/** Compare ignoring `seq`-derived order of equal entities and the cursor. */
export function canonical(s: GraphSnapshot) {
  const byId = <T extends { id: string }>(xs: readonly T[]) =>
    [...xs].sort((a, b) => a.id.localeCompare(b.id));
  return { nodes: byId(s.nodes), connections: byId(s.connections) };
}

export type { GraphSnapshot };
