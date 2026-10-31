/**
 * Commit-time capability enforcement.
 *
 * Maps patch operations to actions and checks each against the touched nodes, so API
 * calls, raw patches and undo all pass the same gate. External-origin patches are
 * already decided by their authority and are skipped. A field changed as part of another
 * field's change (the position of an anchored resize, the rotation of a screen-axis
 * mirror) is judged by that field's action (`compound-fields.ts`).
 */
import type { NodeId } from "../../base/ids/ids.js";
import type { Rejection } from "../../base/result.js";
import type { GraphReader } from "../../data/model/reader.js";
import type { CapabilityAction, NodeRecord } from "../../data/model/records.js";
import type { NodeFieldChanges, PatchOp } from "../../data/patch/types.js";
import type { PatchValidator } from "../../data/patch/validator.js";
import { coveredFields } from "./compound-fields.js";
import { readOnlyRejection, resolveCapability } from "./resolve.js";
import type { CapabilityContext } from "./types.js";

/** Field to action, in fixed order so rejections are deterministic. `z` is unchecked. */
const FIELD_ACTIONS: readonly (readonly [
  keyof NodeFieldChanges,
  CapabilityAction,
])[] = [
  ["position", "move"],
  ["size", "resize"],
  ["rotation", "rotate"],
  ["mirrored", "mirror"],
  ["type", "edit"],
  ["title", "edit"],
  ["status", "edit"],
  ["payload", "edit"],
  ["ports", "edit"],
  ["capabilities", "edit"],
];

export function createCapabilityValidator(
  ctx: CapabilityContext,
): PatchValidator {
  return {
    validate(staged, patch, context) {
      if (context.origin === "external") return undefined;
      if (ctx.readOnly() && patch.ops.length > 0) return readOnlyRejection();
      return new Checker(staged, patch.ops, ctx).run();
    },
  };
}

class Checker {
  private readonly removed = new Map<NodeId, NodeRecord>();
  private readonly added = new Set<NodeId>();

  constructor(
    private readonly graph: GraphReader,
    private readonly ops: readonly PatchOp[],
    private readonly ctx: CapabilityContext,
  ) {
    for (const op of ops) {
      if (op.entity !== "node") continue;
      if (op.op === "remove") this.removed.set(op.record.id, op.record);
      if (op.op === "add") this.added.add(op.record.id);
    }
  }

  run(): Rejection | undefined {
    for (const op of this.ops) {
      const refused = this.checkOp(op);
      if (refused) return refused;
    }
    return undefined;
  }

  private need(
    action: CapabilityAction,
    node: NodeRecord | undefined,
  ): Rejection | undefined {
    if (!node) return undefined;
    const result = resolveCapability(action, node, this.ctx, this.graph);
    return result.ok ? undefined : result.error;
  }

  private nodeOf(id: NodeId): NodeRecord | undefined {
    return this.graph.getNode(id) ?? this.removed.get(id);
  }

  private checkOp(op: PatchOp): Rejection | undefined {
    switch (op.entity) {
      case "node":
        return this.checkNode(op);
      case "port": {
        const owner =
          op.op === "update" ? this.graph.getPort(op.id)?.node : op.record.node;
        // Ports created or removed together with their node are covered by that op.
        if (!owner || this.added.has(owner) || this.removed.has(owner))
          return undefined;
        return this.need("edit", this.nodeOf(owner));
      }
      case "connection":
        return this.checkConnection(op);
    }
  }

  private checkNode(
    op: Extract<PatchOp, { entity: "node" }>,
  ): Rejection | undefined {
    if (op.op === "add") return undefined;
    if (op.op === "remove") return this.need("delete", op.record);
    const current = this.graph.getNode(op.id);
    if (!current) return undefined;
    // Judge by the capabilities in force before the patch, so a patch cannot unlock itself.
    const subject: NodeRecord = op.fields.capabilities
      ? withCapabilities(current, op.fields.capabilities.old)
      : current;
    const covered = coveredFields(current, op.fields);
    for (const [field, action] of FIELD_ACTIONS) {
      if (op.fields[field] === undefined || covered.has(field)) continue;
      const refused = this.need(action, subject);
      if (refused) return refused;
    }
    return undefined;
  }

  private checkConnection(
    op: Extract<PatchOp, { entity: "connection" }>,
  ): Rejection | undefined {
    const attach = (action: CapabilityAction, ...ids: NodeId[]) => {
      for (const id of ids) {
        if (action === "disconnect" && this.removed.has(id)) continue;
        const refused = this.need(action, this.nodeOf(id));
        if (refused) return refused;
      }
      return undefined;
    };
    if (op.op === "add")
      return attach("connect", op.record.from.node, op.record.to.node);
    if (op.op === "remove")
      return attach("disconnect", op.record.from.node, op.record.to.node);
    const { from, to } = op.fields;
    const oldEnds = [from?.old?.node, to?.old?.node].flatMap((n) =>
      n ? [n] : [],
    );
    const newEnds = [from?.new?.node, to?.new?.node].flatMap((n) =>
      n ? [n] : [],
    );
    return attach("disconnect", ...oldEnds) ?? attach("connect", ...newEnds);
  }
}

function withCapabilities(
  node: NodeRecord,
  capabilities: NodeRecord["capabilities"],
): NodeRecord {
  const { capabilities: _dropped, ...rest } = node;
  return capabilities ? { ...rest, capabilities } : rest;
}
