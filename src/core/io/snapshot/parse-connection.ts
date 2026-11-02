/** Shape checks for connections. */
import { isWellFormedId } from "../../base/ids/ids.js";
import type { RouteConstraint } from "../../data/model/records.js";
import {
  isRouteShape,
  validateConnectionRecord,
} from "../../data/model/validate-records.js";
import { isObj, onlyKeys, optStr, reqStr } from "./parse-fields.js";
import { connectionToRecord } from "./records.js";
import type { ErrorSink } from "./snapshot-errors.js";
import type { ConnectionSnapshot } from "./snapshot-types.js";

function endpoint(
  value: unknown,
  path: string,
  sink: ErrorSink,
): ConnectionSnapshot["from"] | undefined {
  if (!isObj(value)) {
    sink.add(
      "invalid-shape",
      "Endpoint must be an object with node and port",
      path,
    );
    return undefined;
  }
  onlyKeys(value, ["node", "port"], path, sink);
  const node = reqStr(value, "node", path, sink);
  const port = reqStr(value, "port", path, sink);
  for (const [key, v] of [
    ["node", node],
    ["port", port],
  ] as const) {
    if (v !== undefined && !isWellFormedId(v)) {
      sink.add(
        "malformed-id",
        `Endpoint ${key} ID is malformed`,
        `${path}.${key}`,
        [v],
      );
      return undefined;
    }
  }
  return node === undefined || port === undefined ? undefined : { node, port };
}

const CONSTRAINT_KEYS = ["kind", "orientation", "at"] as const;

/** Route constraints: known kinds and finite coordinates only. */
function parseRoute(
  value: unknown,
  path: string,
  id: string | undefined,
  sink: ErrorSink,
): readonly RouteConstraint[] | undefined {
  if (value === undefined) return undefined;
  const entities = id === undefined ? [] : [id];
  if (!Array.isArray(value)) {
    sink.add("invalid-shape", "Route must be an array", path, entities);
    return undefined;
  }
  const out: RouteConstraint[] = [];
  value.forEach((item: unknown, i) => {
    const at = `${path}[${i}]`;
    if (!isObj(item) || !isRouteShape([item])) {
      sink.add(
        "malformed-record",
        "Route constraint has an unknown kind or orientation, or a non-finite coordinate",
        at,
        entities,
      );
      return;
    }
    onlyKeys(item, CONSTRAINT_KEYS, at, sink);
    out.push(item as unknown as RouteConstraint);
  });
  return out;
}

export function parseConnection(
  raw: unknown,
  path: string,
  sink: ErrorSink,
): ConnectionSnapshot | undefined {
  if (!isObj(raw)) {
    sink.add("invalid-shape", "Connection must be an object", path);
    return undefined;
  }
  const before = sink.errors.length;
  onlyKeys(raw, ["id", "kind", "from", "to", "route"], path, sink);
  const id = reqStr(raw, "id", path, sink);
  if (id !== undefined && !isWellFormedId(id)) {
    sink.add("malformed-id", "Connection ID is malformed", `${path}.id`, [id]);
  }
  const kind = optStr(raw, "kind", path, sink);
  const from = endpoint(raw.from, `${path}.from`, sink);
  const to = endpoint(raw.to, `${path}.to`, sink);
  const route = parseRoute(raw.route, `${path}.route`, id, sink);
  if (sink.errors.length > before || id === undefined || !from || !to)
    return undefined;
  const connection: ConnectionSnapshot = {
    id,
    ...(kind === undefined ? {} : { kind }),
    from,
    to,
    ...(route === undefined ? {} : { route }),
  };
  const checked = validateConnectionRecord(connectionToRecord(connection));
  if (!checked.ok) {
    sink.add(
      checked.error.code,
      checked.error.message,
      path,
      checked.error.entities,
    );
    return undefined;
  }
  return connection;
}
