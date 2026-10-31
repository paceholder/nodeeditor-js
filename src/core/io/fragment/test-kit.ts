/** Fixtures shared by fragment tests. */
import type { NodeId } from "../../base/ids/ids.js";
import { ok } from "../../base/result.js";
import { createIdAllocator } from "../../edit/commands/id-allocator.js";
import type { PlanContext } from "../../edit/commands/types.js";
import { createDefaultConnectionPolicy } from "../../edit/policy/default-policy.js";
import type { ConnectionPolicy } from "../../edit/policy/types.js";
import type { GraphModel } from "../../graph-model.js";
import {
  createPayloadCodecRegistry,
  type PayloadCodecRegistry,
} from "../snapshot/snapshot-errors.js";

export {
  end,
  type Made,
  make,
  makeModel,
} from "../../edit/commands/test-kit.js";

/** A plan context over a model, as the facade builds it. */
export function contextOf(
  model: GraphModel,
  policy: ConnectionPolicy = createDefaultConnectionPolicy(),
): PlanContext {
  return {
    reader: model.reader,
    ids: createIdAllocator(model.idGenerator, model.idCursor()),
    registry: model.registry,
    policy,
  };
}

/** Put a non-JSON payload on a node, the way a host with Dates in payloads would. */
export function setRawPayload(
  model: GraphModel,
  id: NodeId,
  payload: unknown,
): void {
  model.replaceDocument({
    nodes: model.reader
      .nodes()
      .map((n) => (n.id === id ? { ...n, payload: payload as never } : n)),
    ports: model.reader.ports(),
    connections: model.reader.connections(),
    idCursor: model.idCursor(),
  });
}

/** A codec for `type` that stores `{ when: Date }` as `{ when: number }`. */
export function dateCodecs(type: string): PayloadCodecRegistry {
  const codecs = createPayloadCodecRegistry();
  codecs.register(type, {
    encode: (v) =>
      v === null
        ? ok(null)
        : ok({ when: (v as unknown as { when: Date }).when.getTime() }),
    decode: (j) =>
      j === null
        ? ok(null)
        : ok({ when: new Date((j as { when: number }).when) } as never),
  });
  return codecs;
}
