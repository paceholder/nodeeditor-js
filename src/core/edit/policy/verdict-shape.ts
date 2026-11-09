/** Check what a host validator answered: anything else is a validator failure. */
import { type Rejection, rejectionOf } from "../../base/result.js";
import type { ConnectionVerdict, VerdictProposal } from "./verdict-types.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** The verdict, or undefined when the reply is not of the documented shape. */
export function readVerdict(reply: unknown): ConnectionVerdict | undefined {
  if (!isRecord(reply)) return undefined;
  if (reply.valid === true) return { valid: true };
  if (reply.valid !== false || !isRecord(reply.rejection)) return undefined;
  const { code, message, entities } = reply.rejection;
  if (typeof code !== "string" || code === "") return undefined;
  if (typeof message !== "string") return undefined;
  const ids =
    Array.isArray(entities) && entities.every((e) => typeof e === "string")
      ? (entities as readonly string[])
      : [];
  return {
    valid: false,
    rejection: { code: code as Rejection["code"], message, entities: ids },
  };
}

type FailureCode = "validator-failed" | "validator-timeout" | "validator-stale";

export function failure(
  code: FailureCode,
  message: string,
  proposal: VerdictProposal,
): Rejection {
  return rejectionOf(code, message, [proposal.from.port, proposal.to.port]);
}

export function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
