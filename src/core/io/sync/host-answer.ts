/**
 * Reading a host answer. Answers come from host code, so their shape is checked before
 * the settle table sees them: a malformed answer through `settle` is misuse, one through a
 * callback's promise becomes an unknown outcome.
 */
import { type NodeId, nodeId } from "../../base/ids/ids.js";
import type { Rejection } from "../../base/result.js";
import type { HostAnswer } from "./sync-types.js";

function isId(value: unknown): boolean {
  if (typeof value !== "string") return false;
  try {
    nodeId(value);
    return true;
  } catch {
    return false;
  }
}

const isText = (v: unknown): v is string => typeof v === "string";

/** The answer, or a description of what is wrong with it. */
export function readAnswer(value: unknown): HostAnswer | string {
  if (typeof value !== "object" || value === null) return "it is not an object";
  const a = value as Record<string, unknown>;
  if (a.status === "accepted") {
    if (a.nodeId === undefined) return { status: "accepted" };
    return isId(a.nodeId)
      ? { status: "accepted", nodeId: a.nodeId as NodeId }
      : "the named node ID is not a valid ID (build it with nodeId(text))";
  }
  if (a.status === "unknown")
    return isText(a.reason)
      ? { status: "unknown", reason: a.reason }
      : "an unknown answer needs a text reason";
  if (a.status !== "rejected")
    return "its status is not accepted, rejected or unknown";
  const r = a.rejection as Record<string, unknown> | null | undefined;
  if (
    typeof r !== "object" ||
    r === null ||
    !isText(r.code) ||
    !isText(r.message)
  )
    return "a rejected answer needs a rejection with a code and a message";
  const entities = r.entities ?? [];
  if (!Array.isArray(entities) || !entities.every(isText))
    return "rejection entities must be a list of IDs";
  return {
    status: "rejected",
    rejection: {
      code: r.code as Rejection["code"],
      message: r.message,
      entities,
    },
  };
}
