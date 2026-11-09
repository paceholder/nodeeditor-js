/**
 * Payload comparison for the snapshot diff.
 *
 * A node type with a codec stores a decoded payload in the model and its JSON form in the
 * snapshot, so the two are compared as JSON: the current payload is encoded and compared
 * with the snapshot's. The snapshot payload is decoded only for an add or an update. A
 * codec that fails or throws records an error at the payload's path and yields nothing.
 */
import type { Rejection, Result } from "../../base/result.js";
import type { Payload } from "../../data/model/records.js";
import { cloneJson, jsonEqual } from "./json-value.js";
import type { PayloadCodecRegistry } from "./snapshot-errors.js";
import type { NodeSnapshot, SnapshotError } from "./snapshot-types.js";

export interface PayloadDiffer {
  hasCodec(type: string): boolean;
  /** The payload an added node gets, or undefined when its codec failed. */
  added(snap: NodeSnapshot, path: string): Payload | undefined;
  /** The change for a surviving node, or undefined when equal or a codec failed. */
  changed(
    current: Payload,
    snap: NodeSnapshot,
    path: string,
  ): { readonly old: Payload; readonly new: Payload } | undefined;
}

export function createPayloadDiffer(
  codecs: PayloadCodecRegistry | undefined,
  errors: SnapshotError[],
): PayloadDiffer {
  const run = <T>(
    step: () => Result<T, Rejection>,
    snap: NodeSnapshot,
    path: string,
  ): { readonly value: T } | undefined => {
    try {
      const r = step();
      if (r.ok) return { value: r.value };
      errors.push({
        ...r.error,
        path,
        entities: [snap.id, ...r.error.entities],
      });
    } catch (error) {
      errors.push({
        code: "non-json-payload",
        message: `The payload codec for type ${snap.type} threw: ${error instanceof Error ? error.message : String(error)}`,
        path,
        entities: [snap.id],
      });
    }
    return undefined;
  };
  return {
    hasCodec: (type) => codecs?.get(type) !== undefined,
    added(snap, path) {
      const codec = codecs?.get(snap.type);
      if (!codec) return cloneJson(snap.payload as Payload);
      return run(() => codec.decode(snap.payload), snap, path)?.value;
    },
    changed(current, snap, path) {
      const codec = codecs?.get(snap.type);
      if (!codec) return undefined;
      const encoded = run(() => codec.encode(current), snap, path);
      if (!encoded || jsonEqual(encoded.value, snap.payload)) return undefined;
      const decoded = run(() => codec.decode(snap.payload), snap, path);
      return decoded ? { old: current, new: decoded.value } : undefined;
    },
  };
}
