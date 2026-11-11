/**
 * createNode planner.
 *
 * With a local adapter it builds the node and its ports with IDs from the generator, as
 * one patch. When the host names nodes (`ctx.delegation`), it checks the type the same
 * way and returns a `delegated` plan holding a create-node intent: no ID is minted, no
 * factory runs (the host builds the node and its ports) and nothing is created locally.
 */

import type { NodeId, PortId } from "../../base/ids/ids.js";
import { err, ok, type Result, rejectionOf } from "../../base/result.js";
import type { Payload, PortRecord } from "../../data/model/records.js";
import type {
  NodeTypeDefinition,
  PortSpec,
} from "../../data/node-types/definition.js";
import { defaultLimit } from "../../data/node-types/definition.js";
import type { PatchOp } from "../../data/patch/types.js";
import { ready, rejected, rejectedWith } from "./ops.js";
import type { PlannerFor } from "./types.js";

/** Build a port record from a spec; optional fields are omitted when absent. */
export function portRecord(
  id: PortId,
  node: NodeId,
  spec: PortSpec,
): PortRecord {
  return {
    id,
    node,
    direction: spec.direction,
    typeKey: spec.typeKey,
    limit: spec.limit ?? defaultLimit(spec.direction),
    ...(spec.label === undefined ? {} : { label: spec.label }),
    ...(spec.placement === undefined ? {} : { placement: spec.placement }),
  };
}

/** Run host factories; a throw or failed Result becomes a `factory-failed` rejection. */
function runFactories(
  def: NodeTypeDefinition,
  command: {
    readonly position: { x: number; y: number };
    readonly payload?: Payload;
  },
): Result<{ payload: Payload; specs: readonly PortSpec[] }> {
  try {
    let payload: Payload = null;
    if (command.payload !== undefined) payload = command.payload;
    else if (def.createPayload) {
      const made = def.createPayload({ position: command.position });
      if (!made.ok) {
        return err(
          rejectionOf("factory-failed", made.rejection.message, [def.type]),
        );
      }
      payload = made.value;
    }
    return ok({ payload, specs: def.ports ? def.ports(payload) : [] });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return err(
      rejectionOf(
        "factory-failed",
        `Factory for ${def.type} threw: ${reason}`,
        [def.type],
      ),
    );
  }
}

/** One above the current top of the paint order, or 0 in an empty graph. */
export function frontZ(ctx: {
  reader: { paintOrder(): readonly { z: number }[] };
}): number {
  const order = ctx.reader.paintOrder();
  const top = order[order.length - 1];
  return top ? top.z + 1 : 0;
}

export const planCreateNode: PlannerFor<"createNode"> = (command, ctx) => {
  const def = ctx.registry.get(command.type);
  if (!def) {
    return rejected(
      "unknown-type",
      `Node type ${command.type} is not registered`,
      [command.type],
    );
  }
  if (def.creatable === false) {
    return rejected(
      "not-creatable",
      `Node type ${command.type} cannot be created`,
      [command.type],
    );
  }
  if (ctx.delegation) {
    return {
      kind: "delegated",
      label: `Create ${def.label}`,
      intent: {
        kind: "create-node",
        operationId: ctx.delegation.operationId(),
        type: def.type,
        position: command.position,
        ...(command.payload === undefined ? {} : { payload: command.payload }),
        ...(command.title === undefined ? {} : { title: command.title }),
      },
    };
  }
  const made = runFactories(def, command);
  if (!made.ok) return rejectedWith(made.rejection);

  const id = ctx.ids.node();
  const ports = made.value.specs.map((spec) =>
    portRecord(ctx.ids.port(), id, spec),
  );
  const ops: PatchOp[] = [
    {
      op: "add",
      entity: "node",
      record: {
        id,
        type: def.type,
        position: command.position,
        size: def.defaultSize,
        rotation: 0,
        mirrored: false,
        z: frontZ(ctx),
        ports: ports.map((p) => p.id),
        ...(command.title === undefined ? {} : { title: command.title }),
        payload: made.value.payload,
      },
    },
    ...ports.map((record): PatchOp => ({ op: "add", entity: "port", record })),
  ];
  return ready(`Create ${def.label}`, ops, ctx.ids);
};
