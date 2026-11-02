/**
 * Structural validation of records.
 *
 * Checks shape and structure only (finite numbers, well-formed IDs, ownership,
 * endpoints). Application rules such as type compatibility belong to policy, so
 * structurally valid but application-invalid data is accepted here. Functions return
 * `Result` values and never throw, whatever the input.
 */
import { isWellFormedId } from "../../base/ids/ids.js";
import { ok, type Rejection, type Result, reject } from "../../base/result.js";
import type { ConnectionRecord, NodeRecord, PortRecord } from "./records.js";
import { isFiniteSize, isFiniteVec2, isQuarterTurns } from "./values.js";

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
  return ok(o as unknown as NodeRecord);
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
  const placement = o.placement;
  if (placement !== undefined) {
    const pl = asObject(placement);
    if (!pl || !Number.isFinite(pl.x) || !Number.isFinite(pl.y)) {
      return reject("non-finite", "Port placement must be finite", [id]);
    }
    if (pl.normal !== undefined && !isFiniteVec2(pl.normal)) {
      return reject("non-finite", "Port placement normal must be finite", [id]);
    }
  }
  return ok(o as unknown as PortRecord);
}

function endpointShape(value: unknown): boolean {
  const e = asObject(value);
  return e !== undefined && isWellFormedId(e.node) && isWellFormedId(e.port);
}

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
  if (o.route !== undefined && !isRouteShape(o.route)) {
    return reject(
      "malformed-record",
      "Connection route constraints are malformed or not finite",
      [id],
    );
  }
  return ok(o as unknown as ConnectionRecord);
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
