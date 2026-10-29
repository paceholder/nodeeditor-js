/**
 * Opaque, stable identifiers (MOD-03).
 *
 * IDs are branded strings. The library never derives them from labels, array positions
 * or screen positions, and never parses or numerically orders IDs it did not mint.
 * IDs are unique across the whole document regardless of kind, and a deleted ID is
 * never reused for a different entity.
 */
import { MisuseError } from "../result.js";

declare const brand: unique symbol;
type Brand<K extends string> = string & { readonly [brand]: K };

export type NodeId = Brand<"node">;
export type PortId = Brand<"port">;
export type ConnectionId = Brand<"connection">;
export type GroupId = Brand<"group">;
export type MemberKey = Brand<"member">;
export type ValueId = Brand<"value">;

/** Entity kinds that own an ID space. Group, member and value are reserved. */
export type IdKind =
  | "node"
  | "port"
  | "connection"
  | "group"
  | "member"
  | "value";

export const ID_KINDS: readonly IdKind[] = [
  "node",
  "port",
  "connection",
  "group",
  "member",
  "value",
];

/** An ID is a non-empty string without whitespace. Nothing else is assumed. */
export function isWellFormedId(value: unknown): value is string {
  return typeof value === "string" && /^\S+$/u.test(value);
}

function checked(value: unknown, kind: IdKind): string {
  if (!isWellFormedId(value)) {
    throw new MisuseError(`Malformed ${kind} ID: ${JSON.stringify(value)}`);
  }
  return value;
}

/** Brand a string as a node ID. Throws `MisuseError` if it is malformed. */
export function nodeId(value: string): NodeId {
  return checked(value, "node") as NodeId;
}

export function portId(value: string): PortId {
  return checked(value, "port") as PortId;
}

export function connectionId(value: string): ConnectionId {
  return checked(value, "connection") as ConnectionId;
}

export function groupId(value: string): GroupId {
  return checked(value, "group") as GroupId;
}

export function memberKey(value: string): MemberKey {
  return checked(value, "member") as MemberKey;
}

export function valueId(value: string): ValueId {
  return checked(value, "value") as ValueId;
}
