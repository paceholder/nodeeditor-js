/**
 * From a submitted edit to store calls.
 *
 * The host decodes each submission into named intents and maps every intent to store
 * operations. One submission (one user gesture) becomes one atomic store batch, so the
 * store either takes the whole gesture or refuses it. Intents this store has no call for
 * make the whole submission unsupported.
 */
import {
  decodeIntents,
  type GraphReader,
  type Intent,
  type Rejection,
  rejectionOf,
  type Submission,
} from "@paceholder/nodeeditor-js";
import { pinOf } from "./convert.js";
import type { StoreOp, StoreReply } from "./store.js";

export type Mapped =
  | { readonly ok: true; readonly ops: readonly StoreOp[] }
  | { readonly ok: false; readonly rejection: Rejection };

const unsupported = (what: string): Mapped => ({
  ok: false,
  rejection: rejectionOf("unsupported-command", `This store cannot ${what}`),
});

function opsOf(
  intent: Intent,
  reader: GraphReader,
): readonly StoreOp[] | string {
  switch (intent.kind) {
    case "move":
      // The store keeps no routes, so the route changes folded into the move are ignored.
      return intent.nodes.map((m) => ({
        op: "move-node",
        id: m.node,
        x: m.new.x,
        y: m.new.y,
      }));
    case "delete":
      return [
        ...intent.connections.map((c) => ({
          op: "remove-link" as const,
          id: c.id,
        })),
        ...intent.nodes.map((n) => ({ op: "remove-node" as const, id: n.id })),
      ];
    case "connect":
      return [
        {
          op: "add-link",
          id: intent.connection.id,
          a: pinOf(intent.connection.from),
          b: pinOf(intent.connection.to),
        },
      ];
    case "disconnect":
      return [{ op: "remove-link", id: intent.connection.id }];
    case "reconnect": {
      // Only the changed end is in the intent; the read model already shows the edit.
      const now = reader.getConnection(intent.connection);
      if (!now) return "reconnect a connection that is gone";
      const from = intent.from?.new ?? now.from;
      const to = intent.to?.new ?? now.to;
      return [
        { op: "relink", id: intent.connection, a: pinOf(from), b: pinOf(to) },
      ];
    }
    case "resize":
      return "resize nodes";
    case "rotate":
      return "rotate nodes";
    case "mirror":
      return "mirror nodes";
    case "create-node":
      return "take nodes named by the editor";
    case "other":
      return "store this kind of change";
  }
}

/**
 * The store batch for one submission. `onSubmit` runs right after the edit is displayed,
 * so `reader` already shows it; command patches carry every old value the decoder needs.
 */
export function mapSubmission(
  submission: Submission,
  reader: GraphReader,
): Mapped {
  const ops: StoreOp[] = [];
  for (const intent of decodeIntents(submission, reader)) {
    const mapped = opsOf(intent, reader);
    if (typeof mapped === "string") return unsupported(mapped);
    ops.push(...mapped);
  }
  return { ok: true, ops };
}

/** A store refusal as a library rejection; the adapter fills in the entities. */
export function rejectionOfReply(
  reply: Extract<StoreReply, { ok: false }>,
): Rejection {
  switch (reply.code) {
    case "already-linked":
      return rejectionOf("duplicate-connection", reply.message);
    case "id-in-use":
      return rejectionOf("connection-id-claimed", reply.message);
    case "not-found":
      return rejectionOf("unknown-entity", reply.message);
    case "bad-kind":
      return rejectionOf("unknown-type", reply.message);
  }
}
