/**
 * Structural validation of group records. Same contract as the other record validators:
 * never throws, and a valid record comes back as a new object with only its own fields.
 */
import { isWellFormedId } from "../../base/ids/ids.js";
import { ok, type Rejection, type Result, reject } from "../../base/result.js";
import type { GroupRecord } from "./records.js";

/** Longest group title and style key, in UTF-16 code units. */
export const MAX_GROUP_TITLE_LENGTH = 200;

export function validateGroupRecord(
  input: unknown,
): Result<GroupRecord, Rejection> {
  if (typeof input !== "object" || input === null || Array.isArray(input))
    return reject("malformed-record", "Group record must be an object");
  const o = input as Record<string, unknown>;
  const id = typeof o.id === "string" ? o.id : "";
  if (!isWellFormedId(o.id))
    return reject("malformed-id", "Group ID is malformed", [id]);
  if (typeof o.title !== "string")
    return reject("malformed-record", "Group title must be text", [id]);
  if (o.title.length > MAX_GROUP_TITLE_LENGTH) {
    return reject(
      "out-of-range",
      `Group title must not exceed ${MAX_GROUP_TITLE_LENGTH} characters`,
      [id],
    );
  }
  if (typeof o.locked !== "boolean")
    return reject("malformed-record", "Group locked must be a boolean", [id]);
  if (
    o.style !== undefined &&
    (typeof o.style !== "string" || o.style.length > MAX_GROUP_TITLE_LENGTH)
  ) {
    return reject("malformed-record", "Group style must be a short text key", [
      id,
    ]);
  }
  return ok({
    id: o.id,
    title: o.title,
    locked: o.locked,
    ...(o.style === undefined ? {} : { style: o.style }),
  } as unknown as GroupRecord);
}
