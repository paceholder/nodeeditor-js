/**
 * Submission intent decoder.
 *
 * `decodeIntents(submission, before)` names what a submitted patch does, reading the patch
 * and, for an old value the patch leaves out, the read model before it was applied. It is
 * pure: nothing is changed or cached. Intents come back in the order of the first operation
 * each one claims.
 *
 * Claiming rules (every operation is claimed by exactly one intent):
 * - a node update with `size` is a resize, else with `mirrored` a mirror, else with
 *   `rotation` a rotate, else with `position` a move; any other node update is `other`;
 * - a connection update that changes `from` or `to` is a reconnect; one that changes
 *   `route` is folded into the move of the same patch, or is `other` when there is none;
 * - a node add with the port adds of that node is one create-node;
 * - node removes, the port removes of those nodes and, when the patch removes a node,
 *   every connection remove form one delete; without a node remove a connection remove
 *   is a disconnect, and a connection add is always a connect;
 * - everything else is collected, in patch order, in one `other` intent.
 */
import type { GraphReader } from "../../data/model/reader.js";
import type {
  ConnectionRecord,
  NodeRecord,
  PortRecord,
} from "../../data/model/records.js";
import type { PatchOp } from "../../data/patch/types.js";
import type { Submission } from "../adapter/types.js";
import type {
  Intent,
  NodeMirror,
  NodeMove,
  NodeResize,
  NodeRotate,
  ReconnectIntent,
  RouteChange,
} from "./intent-types.js";
import { claimNode, primaryOf, withOthers } from "./node-claims.js";

type ConnectionUpdate = Extract<
  PatchOp,
  { op: "update"; entity: "connection" }
>;
/** Mutable accumulators, turned into intents at the end. */
type Slot =
  | { kind: "move"; nodes: NodeMove[]; routes: RouteChange[] }
  | { kind: "resize"; nodes: NodeResize[] }
  | { kind: "rotate"; nodes: NodeRotate[] }
  | { kind: "mirror"; nodes: NodeMirror[] }
  | { kind: "create-node"; node: NodeRecord; ports: PortRecord[] }
  | {
      kind: "delete";
      nodes: NodeRecord[];
      ports: PortRecord[];
      connections: ConnectionRecord[];
    }
  | { kind: "other"; ops: PatchOp[] }
  | { kind: "done"; intent: Intent };

type SlotOf<K extends Slot["kind"]> = Extract<Slot, { kind: K }>;

export function decodeIntents(
  submission: Submission,
  before: GraphReader,
): readonly Intent[] {
  const ops = submission.patch.ops;
  const removedNodes = new Set<string>();
  const addedNodes = new Map<string, NodeRecord>();
  for (const op of ops) {
    if (op.entity !== "node" || op.op === "update") continue;
    if (op.op === "add") addedNodes.set(op.record.id, op.record);
    else removedNodes.add(op.record.id);
  }
  const hasMove = ops.some(
    (op) =>
      op.op === "update" &&
      op.entity === "node" &&
      primaryOf(op, before)?.field === "position",
  );

  const slots: Slot[] = [];
  const keyed = new Map<string, Slot>();
  const slot = <K extends Slot["kind"]>(
    key: string,
    make: () => SlotOf<K>,
  ): SlotOf<K> => {
    const found = keyed.get(key);
    if (found) return found as SlotOf<K>;
    const made = make();
    keyed.set(key, made);
    slots.push(made);
    return made;
  };
  const other = (op: PatchOp): void => {
    slot<"other">("other", () => ({ kind: "other", ops: [] })).ops.push(op);
  };
  const deletion = (): SlotOf<"delete"> =>
    slot<"delete">("delete", () => ({
      kind: "delete",
      nodes: [],
      ports: [],
      connections: [],
    }));
  const creation = (node: NodeRecord): SlotOf<"create-node"> =>
    slot<"create-node">(`create:${node.id}`, () => ({
      kind: "create-node",
      node,
      ports: [],
    }));
  const move = (): SlotOf<"move"> =>
    slot<"move">("move", () => ({ kind: "move", nodes: [], routes: [] }));

  for (const op of ops) {
    if (op.op === "add") {
      if (op.entity === "node") creation(op.record);
      else if (op.entity === "port") {
        const owner = addedNodes.get(op.record.node);
        if (owner) creation(owner).ports.push(op.record);
        else other(op);
      } else {
        slots.push({
          kind: "done",
          intent: { kind: "connect", connection: op.record },
        });
      }
    } else if (op.op === "remove") {
      if (op.entity === "node") deletion().nodes.push(op.record);
      else if (op.entity === "port") {
        if (removedNodes.has(op.record.node)) deletion().ports.push(op.record);
        else other(op);
      } else if (removedNodes.size > 0) deletion().connections.push(op.record);
      else
        slots.push({
          kind: "done",
          intent: { kind: "disconnect", connection: op.record },
        });
    } else if (op.entity === "node") {
      const primary = primaryOf(op, before);
      if (!primary) {
        other(op);
        continue;
      }
      claimNode(op, primary, before, {
        move,
        resize: () =>
          slot<"resize">("resize", () => ({ kind: "resize", nodes: [] })),
        rotate: () =>
          slot<"rotate">("rotate", () => ({ kind: "rotate", nodes: [] })),
        mirror: () =>
          slot<"mirror">("mirror", () => ({ kind: "mirror", nodes: [] })),
      });
    } else if (op.entity === "connection") {
      if (op.fields.from || op.fields.to) {
        slots.push({ kind: "done", intent: reconnect(op) });
      } else if (op.fields.route && hasMove) {
        const { route, ...rest } = op.fields;
        move().routes.push({
          connection: op.id,
          ...route,
          ...withOthers(rest),
        });
      } else other(op);
    } else other(op);
  }
  return slots.map(toIntent);
}

function reconnect(op: ConnectionUpdate): ReconnectIntent {
  const { from, to, ...rest } = op.fields;
  const end = <V>(c: { old?: V; new?: V } | undefined) =>
    c && c.old !== undefined && c.new !== undefined
      ? { old: c.old, new: c.new }
      : undefined;
  const f = end(from);
  const t = end(to);
  return {
    kind: "reconnect",
    connection: op.id,
    ...(f ? { from: f } : {}),
    ...(t ? { to: t } : {}),
    ...withOthers(rest),
  };
}

function toIntent(slot: Slot): Intent {
  switch (slot.kind) {
    case "done":
      return slot.intent;
    case "move":
      return { kind: "move", nodes: slot.nodes, routes: slot.routes };
    case "resize":
      return { kind: "resize", nodes: slot.nodes };
    case "rotate":
      return { kind: "rotate", nodes: slot.nodes };
    case "mirror":
      return { kind: "mirror", nodes: slot.nodes };
    case "create-node":
      return { kind: "create-node", node: slot.node, ports: slot.ports };
    case "delete":
      return {
        kind: "delete",
        nodes: slot.nodes,
        ports: slot.ports,
        connections: slot.connections,
      };
    case "other":
      return { kind: "other", ops: slot.ops };
    default: {
      const unreachable: never = slot;
      return unreachable;
    }
  }
}
