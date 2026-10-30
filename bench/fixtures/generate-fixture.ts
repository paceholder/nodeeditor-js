/**
 * Seeded fixture generator. Pure and dependency-free apart from type imports, so
 * benches (Node) and demos (browser) can both use it. The same spec and seed always give
 * an identical snapshot; every list is built in generation order.
 *
 * Layout: nodes on a jittered grid, row by row. Image-symbol nodes (3-5 ports, random
 * quarter-turn rotation and mirroring) and cards (2-6 ports) share one mix of undirected
 * and directed ports over four type keys. Connections mostly join nearby cells; a small
 * fraction join random cells so some paths cross the viewport with both ends off-screen.
 */
import type {
  ConnectionSnapshot,
  GraphSnapshot,
  NodeSnapshot,
  PortSnapshot,
  QuarterTurns,
} from "nodeeditor-js";
import type { FixtureSpec } from "./fixture-specs.js";
import { createPrng, type Prng } from "./prng.js";

export const SYMBOL_TYPE_KEY = "bench-symbol";
export const CARD_TYPE_KEY = "bench-card";
export const PORT_TYPE_KEYS = ["fluid", "signal", "power", "data"] as const;

const NEIGHBOURHOOD = 3;
const UNDIRECTED_SHARE = 0.6;
const JITTER = 0.12;

interface PortInfo {
  readonly id: string;
  readonly direction: PortSnapshot["direction"];
  readonly typeKey: string;
}

function buildNode(
  index: number,
  spec: FixtureSpec,
  cols: number,
  prng: Prng,
  nextPort: () => number,
): { node: NodeSnapshot; ports: PortInfo[] } {
  const row = Math.floor(index / cols);
  const col = index % cols;
  const x =
    (col + 0.5) * spec.pitch + (prng.next() - 0.5) * spec.pitch * JITTER;
  const y =
    (row + 0.5) * spec.pitch + (prng.next() - 0.5) * spec.pitch * JITTER;
  const isSymbol = prng.chance(spec.symbolShare);
  const portCount = isSymbol ? 3 + prng.int(3) : 2 + prng.int(5);
  const ports: PortInfo[] = [];
  const portSnapshots: PortSnapshot[] = [];
  for (let k = 0; k < portCount; k++) {
    const direction: PortSnapshot["direction"] = prng.chance(UNDIRECTED_SHARE)
      ? "undirected"
      : prng.chance(0.5)
        ? "input"
        : "output";
    const info: PortInfo = {
      id: `p${nextPort()}`,
      direction,
      typeKey: prng.pick(PORT_TYPE_KEYS),
    };
    ports.push(info);
    portSnapshots.push({
      id: info.id,
      direction: info.direction,
      typeKey: info.typeKey,
    });
  }
  const id = `n${index + 1}`;
  if (isSymbol) {
    const rotation = prng.int(4) as QuarterTurns;
    const mirrored = prng.chance(0.5);
    return {
      ports,
      node: {
        id,
        type: SYMBOL_TYPE_KEY,
        position: { x, y },
        size: { width: 80, height: 56 },
        ...(rotation !== 0 ? { rotation } : {}),
        ...(mirrored ? { mirrored } : {}),
        ports: portSnapshots,
        payload: { asset: `symbol-${prng.int(8)}` },
      },
    };
  }
  return {
    ports,
    node: {
      id,
      type: CARD_TYPE_KEY,
      position: { x, y },
      size: { width: 100, height: 28 + Math.ceil(portCount / 2) * 24 + 8 },
      title: `Card ${index + 1}`,
      ports: portSnapshots,
      payload: null,
    },
  };
}

/** Whether `a` and `b` may be joined, and the orientation (from, to) if so. */
function orient(
  a: PortInfo,
  b: PortInfo,
): readonly [PortInfo, PortInfo] | undefined {
  if (a.typeKey !== b.typeKey) return undefined;
  if (a.direction === "undirected" && b.direction === "undirected")
    return [a, b];
  if (a.direction === "output" && b.direction === "input") return [a, b];
  if (a.direction === "input" && b.direction === "output") return [b, a];
  return undefined;
}

export function generateFixture(
  spec: FixtureSpec,
  seed: number,
): GraphSnapshot {
  const prng = createPrng(seed);
  const cols = Math.max(1, Math.ceil(Math.sqrt(spec.nodes * 1.6)));
  let portCounter = 0;
  const nextPort = (): number => ++portCounter;
  const nodes: NodeSnapshot[] = [];
  const portsOf: PortInfo[][] = [];
  for (let i = 0; i < spec.nodes; i++) {
    const built = buildNode(i, spec, cols, prng, nextPort);
    nodes.push(built.node);
    portsOf.push(built.ports);
  }

  const connections: ConnectionSnapshot[] = [];
  const usedInputs = new Set<string>();
  const joined = new Set<string>();
  const nodeCount = spec.nodes;
  let attempts = 0;
  const maxAttempts = spec.connections * 200 + 1000;
  while (connections.length < spec.connections) {
    if (++attempts > maxAttempts) {
      throw new Error(
        `${spec.name}: could not place ${spec.connections} connections`,
      );
    }
    const a = prng.int(nodeCount);
    let b: number;
    if (prng.chance(spec.longRange)) {
      b = prng.int(nodeCount);
    } else {
      const row =
        Math.floor(a / cols) + prng.int(2 * NEIGHBOURHOOD + 1) - NEIGHBOURHOOD;
      const col = (a % cols) + prng.int(2 * NEIGHBOURHOOD + 1) - NEIGHBOURHOOD;
      b = row * cols + col;
      if (row < 0 || col < 0 || col >= cols || b >= nodeCount) continue;
    }
    if (a === b) continue;
    const pa = prng.pick(portsOf[a] ?? []);
    const candidates = (portsOf[b] ?? []).filter((pb) => {
      const o = orient(pa, pb);
      return o !== undefined && !usedInputs.has(o[1].id);
    });
    if (candidates.length === 0) continue;
    const pb = prng.pick(candidates);
    const pair = orient(pa, pb);
    if (!pair) continue;
    const [from, to] = pair;
    const key = from.id < to.id ? `${from.id}|${to.id}` : `${to.id}|${from.id}`;
    if (joined.has(key)) continue;
    joined.add(key);
    if (to.direction === "input") usedInputs.add(to.id);
    const fromNode = from === pa ? a : b;
    const toNode = from === pa ? b : a;
    connections.push({
      id: `c${connections.length + 1}`,
      from: { node: `n${fromNode + 1}`, port: from.id },
      to: { node: `n${toNode + 1}`, port: to.id },
    });
  }

  return {
    format: "nodeeditor-js/graph",
    version: 1,
    idCursor: { c: connections.length, n: nodes.length, p: portCounter },
    nodes,
    connections,
  };
}
