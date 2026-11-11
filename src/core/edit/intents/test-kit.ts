/** Helpers for intent decoder tests: plan a command into a submission, count claims. */
import { operationId } from "../../base/ids/ids.js";
import type { Patch, PatchOp } from "../../data/patch/types.js";
import type { GraphModel } from "../../graph-model.js";
import type { Submission } from "../adapter/types.js";
import { makeModel } from "../commands/test-kit.js";
import type { Command } from "../commands/types.js";
import type { Intent } from "./intent-types.js";

/** A model with a resizable two-port `tank` type besides the command test types. */
export function intentModel(): GraphModel {
  const model = makeModel();
  model.registry.register({
    type: "tank",
    label: "Tank",
    defaultSize: { width: 40, height: 20 },
    capabilities: { resize: true },
    ports: () => [
      { direction: "undirected", typeKey: "hydraulic" },
      { direction: "undirected", typeKey: "hydraulic" },
    ],
  });
  return model;
}

/** The submission `execute` would make for a command; throws when it is not ready. */
export function submissionOf(model: GraphModel, command: Command): Submission {
  const planned = model.plan(command);
  if (planned.kind !== "ready")
    throw new Error(`${command.kind} did not plan: ${JSON.stringify(planned)}`);
  return submissionFor(model, planned.patch, planned.label);
}

export function submissionFor(
  model: GraphModel,
  patch: Patch,
  label = "Edit",
): Submission {
  return {
    operationId: operationId("op-test"),
    baseRevision: model.revision(),
    patch,
    label,
    history: "record",
    origin: "local",
  };
}

const key = (op: PatchOp): string =>
  `${op.op}:${op.entity}:${op.op === "update" ? op.id : op.record.id}`;

/** One key per operation of the patch, sorted. */
export function opKeys(patch: Patch): string[] {
  return patch.ops.map(key).sort();
}

/** One key per operation the intents claim, sorted; a duplicate shows double claiming. */
export function claimedKeys(intents: readonly Intent[]): string[] {
  return intents.flatMap(claimsOf).sort();
}

function claimsOf(intent: Intent): string[] {
  switch (intent.kind) {
    case "move":
      return [
        ...intent.nodes.map((n) => `update:node:${n.node}`),
        ...intent.routes.map((r) => `update:connection:${r.connection}`),
      ];
    case "resize":
    case "rotate":
    case "mirror":
      return intent.nodes.map((n) => `update:node:${n.node}`);
    case "create-node":
      return [
        `add:node:${intent.node.id}`,
        ...intent.ports.map((p) => `add:port:${p.id}`),
      ];
    case "delete":
      return [
        ...intent.nodes.map((n) => `remove:node:${n.id}`),
        ...intent.ports.map((p) => `remove:port:${p.id}`),
        ...intent.connections.map((c) => `remove:connection:${c.id}`),
      ];
    case "connect":
      return [`add:connection:${intent.connection.id}`];
    case "disconnect":
      return [`remove:connection:${intent.connection.id}`];
    case "reconnect":
      return [`update:connection:${intent.connection}`];
    case "other":
      return intent.ops.map(key);
    default: {
      const unreachable: never = intent;
      return unreachable;
    }
  }
}

/** A seeded random number source in [0, 1). */
export function rng(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A random command of any editing kind over the model's current entities. */
export function randomCommand(model: GraphModel, next: () => number): Command {
  const pick = <T>(xs: readonly T[]): T | undefined =>
    xs[Math.floor(next() * xs.length)];
  const some = <T>(xs: readonly T[]): T[] => xs.filter(() => next() < 0.5);
  const nodes = model.reader.nodes().map((n) => n.id);
  const connections = model.reader.connections().map((c) => c.id);
  const ends = model.reader.ports().map((p) => ({ node: p.node, port: p.id }));
  const coord = () => Math.round(next() * 400);
  const node = pick(nodes);
  const connection = pick(connections);
  const choice = Math.floor(next() * 12);
  if (!node || choice === 0)
    return {
      kind: "createNode",
      type: "tank",
      position: { x: coord(), y: coord() },
    };
  switch (choice) {
    case 1:
      return {
        kind: "moveNodes",
        moves: some(nodes).map((id) => ({
          node: id,
          position: { x: coord(), y: coord() },
        })),
      };
    case 2:
      return {
        kind: "rotateNodes",
        nodes: some(nodes),
        turns: next() < 0.5 ? 1 : -1,
      };
    case 3:
      return {
        kind: "mirrorNodes",
        nodes: some(nodes),
        axis: next() < 0.5 ? "horizontal" : "vertical",
      };
    case 4:
      return {
        kind: "resizeNode",
        node,
        size: { width: 20 + coord() / 4, height: 20 + coord() / 8 },
        fixed: {
          x: pick([-1, 0, 1] as const) ?? 0,
          y: pick([-1, 0, 1] as const) ?? 0,
        },
      };
    case 5:
      return {
        kind: "deleteEntities",
        nodes: some(nodes),
        connections: some(connections),
      };
    case 6: {
      const from = pick(ends);
      const to = pick(ends);
      if (!from || !to)
        return { kind: "createNode", type: "tank", position: { x: 0, y: 0 } };
      return { kind: "connect", from, to };
    }
    case 7: {
      const target = pick(ends);
      if (!connection || !target)
        return { kind: "updateNode", node, title: "t" };
      return {
        kind: "reconnect",
        connection,
        end: next() < 0.5 ? "from" : "to",
        target,
      };
    }
    case 8:
      return connection
        ? {
            kind: "setRoute",
            connection,
            route: [
              { kind: "segment", orientation: "horizontal", at: coord() },
            ],
          }
        : { kind: "reorderNodes", nodes: [node], to: "front" };
    case 9:
      return {
        kind: "duplicate",
        nodes: some(nodes),
        placement: { kind: "offset", by: { x: 10, y: 10 } },
      };
    case 10:
      return { kind: "updateNode", node, title: `t${coord()}` };
    default:
      return {
        kind: "reorderNodes",
        nodes: some(nodes),
        to: next() < 0.5 ? "front" : "back",
      };
  }
}
