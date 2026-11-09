/**
 * Reference integrity of the staged result.
 *
 * Only entities the patch touched are checked, so state that was already odd but safe
 * (for example an over-limit attachment) is left alone. A violation is reported as
 * `dangling-reference` (or the endpoint codes for connections).
 */

import { type Rejection, rejectionOf } from "../../base/result.js";
import { checkConnectionEndpoints } from "../model/validate-records.js";
import type { StagedState } from "./stage.js";
import type { PatchOp } from "./types.js";

function dangling(message: string, entities: readonly string[]): Rejection {
  return rejectionOf("dangling-reference", message, entities);
}

function checkOp(stage: StagedState, op: PatchOp): Rejection | undefined {
  switch (op.entity) {
    case "node": {
      const id = op.op === "update" ? op.id : op.record.id;
      const node = stage.getNode(id);
      if (node) {
        for (const p of node.ports) {
          if (stage.getPort(p)?.node !== node.id) {
            return dangling(`Node ${id} lists missing or foreign port ${p}`, [
              id,
              p,
            ]);
          }
        }
        // A port dropped from the list must be gone too, or it would have no owner.
        const dropped =
          op.op === "update"
            ? op.fields.ports?.old?.find(
                (p) => !node.ports.includes(p) && stage.getPort(p)?.node === id,
              )
            : undefined;
        if (dropped) {
          return dangling(`Port ${dropped} is no longer listed by node ${id}`, [
            id,
            dropped,
          ]);
        }
        return undefined;
      }
      const first = stage.connectionsOfNode(id)[0];
      if (first) {
        return dangling(`Node ${id} is still used by connection ${first.id}`, [
          id,
          first.id,
        ]);
      }
      if (op.op === "remove") {
        const orphan = op.record.ports.find((p) => stage.getPort(p));
        if (orphan) {
          return dangling(`Port ${orphan} outlives its node ${id}`, [
            id,
            orphan,
          ]);
        }
      }
      return undefined;
    }
    case "port": {
      const id = op.op === "update" ? op.id : op.record.id;
      const port = stage.getPort(id);
      if (port) {
        if (!stage.getNode(port.node)?.ports.includes(port.id)) {
          return dangling(`Port ${id} is not listed by node ${port.node}`, [
            id,
            port.node,
          ]);
        }
        return undefined;
      }
      const first = stage.connectionsOfPort(id)[0];
      if (first) {
        return dangling(`Port ${id} is still used by connection ${first.id}`, [
          id,
          first.id,
        ]);
      }
      if (
        op.op === "remove" &&
        stage.getNode(op.record.node)?.ports.includes(id)
      ) {
        return dangling(
          `Node ${op.record.node} still lists removed port ${id}`,
          [op.record.node, id],
        );
      }
      return undefined;
    }
    case "connection": {
      const id = op.op === "update" ? op.id : op.record.id;
      const connection = stage.getConnection(id);
      if (!connection) return undefined;
      const checked = checkConnectionEndpoints(connection, stage);
      return checked.ok ? undefined : checked.error;
    }
  }
}

/** Check every entity the operations touched against the final staged state. */
export function checkIntegrity(
  stage: StagedState,
  ops: readonly PatchOp[],
): Rejection | undefined {
  for (const op of ops) {
    const rejection = checkOp(stage, op);
    if (rejection) return rejection;
  }
  return undefined;
}
