/**
 * Structural validation of records.
 *
 * Checks shape and structure only (finite numbers, well-formed IDs, ownership,
 * endpoints). Application rules such as type compatibility belong to policy, so
 * structurally valid but application-invalid data is accepted here. Functions return
 * `Result` values and never throw, whatever the input.
 *
 * A valid record comes back as a new object holding only the record's own fields, with
 * fresh copies of its value objects and lists, so the store never shares an object with
 * the caller and never keeps unknown keys. The payload is application data of any size
 * and is kept as given.
 */
import { isWellFormedId } from "../../base/ids/ids.js";
import { ok, type Rejection, type Result, reject } from "../../base/result.js";
import { copyCapabilities } from "./capability-overrides.js";
import type {
  ConnectionRecord,
  NodeRecord,
  PortRecord,
  RouteConstraint,
} from "./records.js";
import {
  inWorldRange,
  isFiniteSize,
  isFiniteVec2,
  isQuarterTurns,
  MAX_WORLD_COORD,
  MAX_WORLD_SIZE,
  type Vec2,
} from "./values.js";

type Obj = Record<string, unknown>;

function asObject(input: unknown): Obj | undefined {
  return typeof input === "object" && input !== null && !Array.isArray(input)
    ? (input as Obj)
    : undefined;
}

function describeId(value: unknown): string {
  return typeof value === "string" ? value : "";
}

const DIRECTIONS: ReadonlySet<unknown> = new Set([
  "input",
  "output",
  "undirected",
]);

const optionalText = (value: unknown): boolean =>
  value === undefined || typeof value === "string";

export function validateNodeRecord(
  input: unknown,
): Result<NodeRecord, Rejection> {
  const o = asObject(input);
  if (!o) return reject("malformed-record", "Node record must be an object");
  const id = describeId(o.id);
  if (!isWellFormedId(o.id))
    return reject("malformed-id", "Node ID is malformed", [id]);
  if (typeof o.type !== "string")
    return reject("malformed-record", "Node type must be a string", [id]);
  if (!isFiniteVec2(o.position))
    return reject("non-finite", "Node position must be finite", [id]);
  if (!isFiniteSize(o.size))
    return reject("non-finite", "Node size must be finite and non-negative", [
      id,
    ]);
  const { x, y } = o.position;
  if (!inWorldRange(x) || !inWorldRange(y)) {
    return reject(
      "out-of-range",
      `Node position must stay within +-${MAX_WORLD_COORD}`,
      [id],
    );
  }
  if (o.size.width > MAX_WORLD_SIZE || o.size.height > MAX_WORLD_SIZE) {
    return reject(
      "out-of-range",
      `Node width and height must not exceed ${MAX_WORLD_SIZE}`,
      [id],
    );
  }
  if (typeof o.z !== "number" || !Number.isFinite(o.z)) {
    return reject("non-finite", "Node z must be finite", [id]);
  }
  if (!isQuarterTurns(o.rotation))
    return reject("malformed-record", "Rotation must be 0..3", [id]);
  if (typeof o.mirrored !== "boolean") {
    return reject("malformed-record", "Node mirrored must be a boolean", [id]);
  }
  if (!Array.isArray(o.ports))
    return reject("malformed-record", "Node ports must be an array", [id]);
  const seen = new Set<string>();
  for (const p of o.ports as unknown[]) {
    if (!isWellFormedId(p))
      return reject("malformed-id", "Port ID in node is malformed", [id]);
    if (seen.has(p))
      return reject("duplicate-id", "Port listed twice in node", [id, p]);
    seen.add(p);
  }
  if (!("payload" in o))
    return reject("malformed-record", "Node payload is required", [id]);
  if (!optionalText(o.title) || !optionalText(o.status))
    return reject("malformed-record", "Node title and status are text", [id]);
  const capabilities =
    o.capabilities === undefined ? undefined : copyCapabilities(o.capabilities);
  if (o.capabilities !== undefined && !capabilities) {
    return reject(
      "malformed-record",
      "Node capabilities must map known actions to booleans",
      [id],
    );
  }
  if (o.group !== undefined && !isWellFormedId(o.group))
    return reject("malformed-id", "Node group ID is malformed", [id]);
  const position = o.position as NodeRecord["position"];
  const size = o.size as NodeRecord["size"];
  return ok({
    id: o.id,
    type: o.type,
    position: { x: position.x, y: position.y },
    size: { width: size.width, height: size.height },
    rotation: o.rotation,
    mirrored: o.mirrored,
    z: o.z,
    ports: [...(o.ports as NodeRecord["ports"])],
    ...(o.title === undefined ? {} : { title: o.title }),
    ...(o.status === undefined ? {} : { status: o.status }),
    payload: o.payload,
    ...(capabilities ? { capabilities } : {}),
    ...(o.group === undefined ? {} : { group: o.group }),
  } as unknown as NodeRecord);
}

export function validatePortRecord(
  input: unknown,
): Result<PortRecord, Rejection> {
  const o = asObject(input);
  if (!o) return reject("malformed-record", "Port record must be an object");
  const id = describeId(o.id);
  if (!isWellFormedId(o.id))
    return reject("malformed-id", "Port ID is malformed", [id]);
  if (!isWellFormedId(o.node)) {
    return reject("malformed-id", "Port owner node ID is malformed", [
      id,
      describeId(o.node),
    ]);
  }
  if (!DIRECTIONS.has(o.direction))
    return reject("malformed-record", "Unknown port direction", [id]);
  if (typeof o.typeKey !== "string")
    return reject("malformed-record", "Port typeKey must be a string", [id]);
  const limit = o.limit;
  const limitOk =
    limit === "unlimited" ||
    (typeof limit === "number" && Number.isInteger(limit) && limit >= 0);
  if (!limitOk)
    return reject(
      "invalid-limit",
      "Limit must be an integer >= 0 or unlimited",
      [id],
    );
  if (!optionalText(o.label))
    return reject("malformed-record", "Port label must be text", [id]);
  const pl = asObject(o.placement);
  if (o.placement !== undefined) {
    if (!pl || !Number.isFinite(pl.x) || !Number.isFinite(pl.y)) {
      return reject("non-finite", "Port placement must be finite", [id]);
    }
    if (pl.normal !== undefined && !isFiniteVec2(pl.normal)) {
      return reject("non-finite", "Port placement normal must be finite", [id]);
    }
  }
  const normal = pl?.normal as Vec2 | undefined;
  return ok({
    id: o.id,
    node: o.node,
    direction: o.direction,
    typeKey: o.typeKey,
    limit,
    ...(o.label === undefined ? {} : { label: o.label }),
    ...(pl
      ? {
          placement: {
            x: pl.x,
            y: pl.y,
            ...(normal ? { normal: { x: normal.x, y: normal.y } } : {}),
          },
        }
      : {}),
  } as unknown as PortRecord);
}

function endpointShape(value: unknown): boolean {
  const e = asObject(value);
  return e !== undefined && isWellFormedId(e.node) && isWellFormedId(e.port);
}

/**
 * Most route constraints one connection may hold. A hand-drawn route has a handful; the
 * bound keeps untrusted input and pinned routing cheap.
 */
export const MAX_ROUTE_CONSTRAINTS = 256;

/** A route is an array of known constraints with finite coordinates. */
export function isRouteShape(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    value.every((c) => {
      const o = asObject(c);
      return (
        o !== undefined &&
        o.kind === "segment" &&
        (o.orientation === "horizontal" || o.orientation === "vertical") &&
        typeof o.at === "number" &&
        Number.isFinite(o.at)
      );
    })
  );
}

export function validateConnectionRecord(
  input: unknown,
): Result<ConnectionRecord, Rejection> {
  const o = asObject(input);
  if (!o)
    return reject("malformed-record", "Connection record must be an object");
  const id = describeId(o.id);
  if (!isWellFormedId(o.id))
    return reject("malformed-id", "Connection ID is malformed", [id]);
  if (typeof o.kind !== "string")
    return reject("malformed-record", "Connection kind must be a string", [id]);
  if (!endpointShape(o.from) || !endpointShape(o.to)) {
    return reject("malformed-id", "Connection endpoint IDs are malformed", [
      id,
    ]);
  }
  if (Array.isArray(o.route) && o.route.length > MAX_ROUTE_CONSTRAINTS) {
    return reject(
      "limit-exceeded",
      `A connection holds at most ${MAX_ROUTE_CONSTRAINTS} route constraints`,
      [id],
    );
  }
  if (o.route !== undefined && !isRouteShape(o.route)) {
    return reject(
      "malformed-record",
      "Connection route constraints are malformed or not finite",
      [id],
    );
  }
  const route = o.route as readonly RouteConstraint[] | undefined;
  if (route?.some((c) => !inWorldRange(c.at))) {
    return reject(
      "out-of-range",
      `Route constraints must stay within +-${MAX_WORLD_COORD}`,
      [id],
    );
  }
  const end = (e: unknown): ConnectionRecord["from"] => {
    const v = e as ConnectionRecord["from"];
    return { node: v.node, port: v.port };
  };
  return ok({
    id: o.id,
    kind: o.kind,
    from: end(o.from),
    to: end(o.to),
    ...(route
      ? {
          route: route.map((c) => ({
            kind: c.kind,
            orientation: c.orientation,
            at: c.at,
          })),
        }
      : {}),
  } as unknown as ConnectionRecord);
}

/** A port must name its owner, and the owner must list the port. */
export function checkPortOwnership(
  port: PortRecord,
  owner: NodeRecord,
): Result<true, Rejection> {
  if (port.node !== owner.id || !owner.ports.includes(port.id)) {
    return reject("port-node-mismatch", "Port and owning node disagree", [
      port.id,
      owner.id,
    ]);
  }
  return ok(true);
}

/** Lookup used for reference checks; satisfied by `GraphReader`. */
export interface RecordLookup {
  getNode(id: NodeRecord["id"]): NodeRecord | undefined;
  getPort(id: PortRecord["id"]): PortRecord | undefined;
}

/** Both endpoints must exist, and each port must belong to the node the endpoint names. */
export function checkConnectionEndpoints(
  connection: ConnectionRecord,
  lookup: RecordLookup,
): Result<true, Rejection> {
  for (const end of [connection.from, connection.to]) {
    if (!lookup.getNode(end.node)) {
      return reject("dangling-endpoint", `Node ${end.node} does not exist`, [
        connection.id,
        end.node,
      ]);
    }
    const port = lookup.getPort(end.port);
    if (!port) {
      return reject("dangling-endpoint", `Port ${end.port} does not exist`, [
        connection.id,
        end.port,
      ]);
    }
    if (port.node !== end.node) {
      return reject(
        "port-node-mismatch",
        "Endpoint port belongs to another node",
        [connection.id, end.port, end.node],
      );
    }
  }
  return ok(true);
}
