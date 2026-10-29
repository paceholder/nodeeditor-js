/** Test fixtures for scene tests: build a model from a compact graph description. */

import type { PortPlacement } from "../../data/model/records.js";
import { mkConn, mkNode, mkPort } from "../../data/model/test-helpers.js";
import type { QuarterTurns } from "../../data/model/values.js";
import type { PatchOp } from "../../data/patch/types.js";
import { createGraphModel, type GraphModel } from "../../graph-model.js";

export interface PortSpec {
  readonly id: string;
  readonly placement?: PortPlacement;
}

export interface NodeSpec {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly w?: number;
  readonly h?: number;
  readonly rotation?: QuarterTurns;
  readonly mirrored?: boolean;
  readonly z?: number;
  readonly type?: string;
  readonly ports?: readonly PortSpec[];
}

/** [id, fromNode, fromPort, toNode, toPort] */
export type ConnSpec = readonly [string, string, string, string, string];

export function graphOps(
  nodes: readonly NodeSpec[],
  conns: readonly ConnSpec[] = [],
): PatchOp[] {
  const ops: PatchOp[] = [];
  for (const n of nodes) {
    const ports = n.ports ?? [];
    ops.push({
      op: "add",
      entity: "node",
      record: mkNode(n.id, {
        position: { x: n.x, y: n.y },
        size: { width: n.w ?? 40, height: n.h ?? 20 },
        rotation: n.rotation ?? 0,
        mirrored: n.mirrored ?? false,
        z: n.z ?? 0,
        type: n.type ?? "t",
        ports: ports.map((p) => mkPort(p.id, n.id).id),
      }),
    });
    for (const p of ports) {
      ops.push({
        op: "add",
        entity: "port",
        record: mkPort(
          p.id,
          n.id,
          p.placement ? { placement: p.placement } : {},
        ),
      });
    }
  }
  for (const [id, fn, fp, tn, tp] of conns) {
    ops.push({
      op: "add",
      entity: "connection",
      record: mkConn(id, fn, fp, tn, tp),
    });
  }
  return ops;
}

export function buildModel(
  nodes: readonly NodeSpec[],
  conns: readonly ConnSpec[] = [],
): GraphModel {
  const model = createGraphModel();
  const result = model.submit({ ops: graphOps(nodes, conns) });
  if (result.status !== "accepted") {
    throw new Error(`fixture rejected: ${JSON.stringify(result)}`);
  }
  return model;
}

/** A node with one undirected port on its right edge and one on its left edge. */
export function twoPortNode(
  id: string,
  x: number,
  y: number,
  over: Partial<NodeSpec> = {},
): NodeSpec {
  return {
    id,
    x,
    y,
    ports: [
      { id: `${id}L`, placement: { x: 0, y: 0.5 } },
      { id: `${id}R`, placement: { x: 1, y: 0.5 } },
    ],
    ...over,
  };
}

/**
 * Submit a large graph in chunks: nodes (with their ports) first, then connections.
 * One huge patch validates slowly, and chunks keep each commit small.
 */
export function submitChunked(
  model: GraphModel,
  nodes: readonly NodeSpec[],
  conns: readonly ConnSpec[],
): void {
  const send = (ops: PatchOp[]): void => {
    const r = model.submit({ ops });
    if (r.status !== "accepted") throw new Error("fixture chunk rejected");
  };
  for (let i = 0; i < nodes.length; i += 250)
    send(graphOps(nodes.slice(i, i + 250)));
  for (let i = 0; i < conns.length; i += 500)
    send(graphOps([], conns.slice(i, i + 500)));
}
