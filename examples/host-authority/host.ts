/**
 * Plugging the store into the editor through the snapshot adapter.
 *
 * The host answers every submitted edit with the store's verdict, lets the store name new
 * nodes (delegated creation), issues connection IDs that are unique across clients, and
 * pushes a fresh snapshot whenever the store reports a change.
 */
import {
  createCounterIdGenerator,
  createSnapshotModel,
  type DelegatedIntent,
  type HostAnswer,
  type IdGenerator,
  nodeId,
  type PushResult,
  rejectionOf,
  type SnapshotModel,
  type Submission,
} from "@paceholder/nodeeditor-js";
import { mapSubmission, rejectionOfReply } from "./calls.js";
import { storeRegistry, toSnapshot } from "./convert.js";
import type { Store, StoreReply } from "./store.js";

/**
 * Connection IDs unique across every client of the store: a counter behind a per-client
 * prefix (`alice.c1`, `alice.c2`, ...). `observe` lets a pushed `alice.c7` advance the
 * counter, so a client that reconnects under the same prefix does not reuse an ID.
 */
export function prefixedIds(clientId: string): IdGenerator {
  const counter = createCounterIdGenerator();
  const prefix = `${clientId}.`;
  return {
    next(kind, cursor) {
      const { id, cursor: next } = counter.next(kind, cursor);
      return { id: `${prefix}${id}`, cursor: next };
    },
    observe(id, cursor) {
      if (!id.startsWith(prefix) || !counter.observe) return cursor;
      return counter.observe(id.slice(prefix.length), cursor);
    },
  };
}

const answerOf = (reply: StoreReply): HostAnswer =>
  reply.ok
    ? { status: "accepted" }
    : { status: "rejected", rejection: rejectionOfReply(reply) };

/** A transport failure leaves the outcome unknown: the call may or may not have applied. */
async function viaTransport(
  call: () => Promise<HostAnswer>,
): Promise<HostAnswer> {
  try {
    return await call();
  } catch (error) {
    return {
      status: "unknown",
      reason: `The store did not answer: ${String(error)}`,
    };
  }
}

export interface HostSession {
  readonly model: SnapshotModel;
  /** Fetch the store's document and push it, with the store's version as its revision. */
  refresh(): Promise<PushResult | undefined>;
  dispose(): void;
}

export interface SessionOptions {
  readonly clientId: string;
  /** How long an edit or a creation may wait for the store. */
  readonly timeoutMs?: number;
}

export async function openSession(
  store: Store,
  options: SessionOptions,
): Promise<HostSession> {
  let disposed = false;

  const onSubmit = (submission: Submission): Promise<HostAnswer> =>
    viaTransport(async () => {
      const mapped = mapSubmission(submission, model.reader);
      if (!mapped.ok)
        return { status: "rejected", rejection: mapped.rejection };
      return answerOf(await store.apply(mapped.ops));
    });

  const onDelegate = (intent: DelegatedIntent): Promise<HostAnswer> =>
    viaTransport(async () => {
      // A paste (fragment) or a duplicate (by ID): this store makes one node at a time.
      if (intent.kind !== "create-node")
        return {
          status: "rejected",
          rejection: rejectionOf(
            "unsupported-command",
            "This store cannot paste or duplicate",
          ),
        };
      const { type, position, title } = intent;
      const reply = await store.apply([
        {
          op: "add-node",
          kind: type,
          x: position.x,
          y: position.y,
          label: title ?? type,
        },
      ]);
      const created = reply.ok ? reply.created[0] : undefined;
      // The answer names the ID the node has in the store's later documents.
      if (created) return { status: "accepted", nodeId: nodeId(created) };
      return reply.ok
        ? { status: "unknown", reason: "The store named no node" }
        : answerOf(reply);
    });

  const model = createSnapshotModel({
    registry: storeRegistry(),
    idGenerator: prefixedIds(options.clientId),
    onSubmit,
    nodeCreation: "delegated",
    onDelegate,
    timeoutMs: options.timeoutMs ?? 5000,
  });

  async function refresh(): Promise<PushResult | undefined> {
    const doc = await store.read();
    if (disposed) return undefined;
    // Reads can come back out of order; a push older than the last one is ignored.
    return model.pushSnapshot(toSnapshot(doc), doc.version);
  }

  const stop = store.onChange(() => void refresh());
  await refresh();
  return {
    model,
    refresh,
    dispose() {
      disposed = true;
      stop();
      model.dispose();
    },
  };
}
