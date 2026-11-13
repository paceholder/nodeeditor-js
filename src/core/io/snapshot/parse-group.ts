/**
 * Shape check for a group entry. Same contract as the node and connection parsers: a
 * normalized entry, or undefined after recording every problem. Title length and ID
 * form are delegated to the record validator, so a loaded group obeys the patch rules.
 */
import { validateGroupRecord } from "../../data/model/validate-group.js";
import { isObj, onlyKeys, optStr, reqStr } from "./parse-fields.js";
import type { ErrorSink } from "./snapshot-errors.js";
import type { GroupSnapshot } from "./snapshot-types.js";

const GROUP_KEYS = ["id", "title", "locked", "style"];

export function parseGroup(
  raw: unknown,
  path: string,
  sink: ErrorSink,
): GroupSnapshot | undefined {
  if (!isObj(raw)) {
    sink.add("invalid-shape", "Group must be an object", path);
    return undefined;
  }
  const before = sink.count();
  onlyKeys(raw, GROUP_KEYS, path, sink);
  const id = reqStr(raw, "id", path, sink);
  const title = reqStr(raw, "title", path, sink);
  const style = optStr(raw, "style", path, sink);
  if (raw.locked !== undefined && typeof raw.locked !== "boolean")
    sink.add("invalid-shape", "locked must be a boolean", `${path}.locked`);
  if (sink.count() > before || id === undefined || title === undefined)
    return undefined;
  const group: GroupSnapshot = {
    id,
    title,
    ...(raw.locked === true ? { locked: true } : {}),
    ...(style === undefined ? {} : { style }),
  };
  const checked = validateGroupRecord({
    ...group,
    locked: raw.locked === true,
  });
  if (!checked.ok) {
    sink.add(
      checked.rejection.code,
      checked.rejection.message,
      path,
      checked.rejection.entities,
    );
    return undefined;
  }
  return group;
}
