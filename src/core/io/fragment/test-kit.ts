/** Fixtures shared by fragment tests. */
import type { NodeId } from "../../base/ids/ids.js";
import { ok } from "../../base/result.js";
import { createIdAllocator } from "../../edit/commands/id-allocator.js";
import { resolveSizeLimits } from "../../edit/commands/size-limits.js";
import { end, make } from "../../edit/commands/test-kit.js";
import type { PlanContext } from "../../edit/commands/types.js";
import { createDefaultConnectionPolicy } from "../../edit/policy/default-policy.js";
import type { ConnectionPolicy } from "../../edit/policy/types.js";
import type { GraphModel } from "../../graph-model.js";
import {
  createPayloadCodecRegistry,
  type PayloadCodecRegistry,
} from "../snapshot/snapshot-errors.js";
import { extractFragment } from "./extract.js";
import type { ClipboardFragment } from "./fragment-types.js";

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
    sizeLimits: (node) => resolveSizeLimits(node, model.registry),
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

/** Two connected pipes plus a third joined to the second; returns the copied pair. */
export function pairWithNeighbour(model: GraphModel) {
  const a = make(model, "pipe", 0, 0);
  const b = make(model, "pipe", 100, 40);
  const c = make(model, "pipe", 300, 0);
  model.connect(end(a, 1), end(b, 0));
  model.connect(end(b, 1), end(c, 0));
  return { a, b, c };
}

/** Extract a fragment of `nodes` or throw. */
export function fragmentOf(
  model: GraphModel,
  nodes: readonly NodeId[],
): ClipboardFragment {
  const r = extractFragment(model.reader, { nodes });
  if (!r.ok) throw new Error(`extract failed: ${r.error.message}`);
  return r.value.fragment;
}
