/**
 * Node update claims of the intent decoder: which primary field an update changes and the
 * per-node entry it contributes to a resize, mirror, rotate or move intent.
 */
import type { GraphReader } from "../../data/model/reader.js";
import type { NodeRecord } from "../../data/model/records.js";
import type { PatchOp } from "../../data/patch/types.js";
import type {
  Change,
  NodeMirror,
  NodeMove,
  NodeResize,
  NodeRotate,
} from "./intent-types.js";

export type NodeUpdate = Extract<PatchOp, { op: "update"; entity: "node" }>;
type NodeField = keyof NodeUpdate["fields"];

export interface Primary {
  readonly field: "size" | "mirrored" | "rotation" | "position";
}

const PRIMARY_ORDER = ["size", "mirrored", "rotation", "position"] as const;

/** The first primary field the update changes with a usable old and new value. */
export function primaryOf(
  op: NodeUpdate,
  before: GraphReader,
): Primary | undefined {
  for (const field of PRIMARY_ORDER) {
    if (op.fields[field] === undefined) continue;
    return changeOf(op, field, before) ? { field } : undefined;
  }
  return undefined;
}

/** Old and new value of a required node field; the old one from `before` if missing. */
function changeOf<F extends (typeof PRIMARY_ORDER)[number]>(
  op: NodeUpdate,
  field: F,
  before: GraphReader,
): Change<NodeRecord[F]> | undefined {
  const change = op.fields[field];
  if (!change || change.new === undefined) return undefined;
  const old = change.old ?? before.getNode(op.id)?.[field];
  if (old === undefined) return undefined;
  return { old, new: change.new } as Change<NodeRecord[F]>;
}

/** Where each kind of node entry goes; one intent per kind collects them. */
export interface NodeSlots {
  move(): { nodes: NodeMove[] };
  resize(): { nodes: NodeResize[] };
  rotate(): { nodes: NodeRotate[] };
  mirror(): { nodes: NodeMirror[] };
}

export function claimNode(
  op: NodeUpdate,
  primary: Primary,
  before: GraphReader,
  slots: NodeSlots,
): void {
  const node = op.id;
  const without = (...keys: NodeField[]) => {
    const rest: Record<string, unknown> = { ...op.fields };
    for (const key of keys) delete rest[key];
    return withOthers(rest as NodeUpdate["fields"]);
  };
  switch (primary.field) {
    case "size": {
      const size = changeOf(op, "size", before) as Change<NodeRecord["size"]>;
      const position = changeOf(op, "position", before);
      slots.resize().nodes.push({
        node,
        ...size,
        ...(position ? { position } : {}),
        ...without("size", ...(position ? (["position"] as const) : [])),
      });
      return;
    }
    case "mirrored": {
      const flag = changeOf(op, "mirrored", before) as Change<boolean>;
      const rotation = changeOf(op, "rotation", before);
      slots.mirror().nodes.push({
        node,
        ...flag,
        ...(rotation ? { rotation } : {}),
        ...without("mirrored", ...(rotation ? (["rotation"] as const) : [])),
      });
      return;
    }
    case "rotation": {
      const turns = changeOf(op, "rotation", before) as Change<
        NodeRecord["rotation"]
      >;
      slots.rotate().nodes.push({ node, ...turns, ...without("rotation") });
      return;
    }
    case "position": {
      const at = changeOf(op, "position", before) as Change<
        NodeRecord["position"]
      >;
      slots.move().nodes.push({ node, ...at, ...without("position") });
      return;
    }
    default: {
      const unreachable: never = primary.field;
      throw new Error(`Unhandled primary field ${String(unreachable)}`);
    }
  }
}

/** `{ others }` when the remaining field changes are not empty, else nothing. */
export function withOthers<T extends object>(rest: T): { readonly others?: T } {
  return Object.keys(rest).length > 0 ? { others: rest } : {};
}
