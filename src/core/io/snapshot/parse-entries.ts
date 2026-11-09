/**
 * Shape checks for ports and nodes.
 *
 * Each parser takes untrusted input and returns a normalized entry, or undefined after
 * recording every problem it found. Field types are checked here; numeric ranges, ID
 * form and limits are delegated to `model/validate-records.ts`, so a loaded record obeys
 * exactly the rules a patch obeys.
 */
import { isWellFormedId } from "../../base/ids/ids.js";
import type { AttachmentLimit } from "../../data/model/records.js";
import {
  validateNodeRecord,
  validatePortRecord,
} from "../../data/model/validate-records.js";
import type { QuarterTurns } from "../../data/model/values.js";
import { checkJson } from "./json-value.js";
import {
  capabilities,
  DIRECTIONS,
  isObj,
  num,
  onlyKeys,
  optStr,
  placement,
  reqStr,
  vec,
} from "./parse-fields.js";
import { nodeToRecord, portToRecord } from "./records.js";
import type { ErrorSink, SnapshotLimits } from "./snapshot-errors.js";
import type { NodeSnapshot, PortSnapshot } from "./snapshot-types.js";

const PORT_KEYS = ["id", "direction", "typeKey", "limit", "label", "placement"];

export function parsePort(
  raw: unknown,
  path: string,
  owner: string,
  sink: ErrorSink,
): PortSnapshot | undefined {
  if (!isObj(raw)) {
    sink.add("invalid-shape", "Port must be an object", path);
    return undefined;
  }
  const before = sink.count();
  onlyKeys(raw, PORT_KEYS, path, sink);
  const id = reqStr(raw, "id", path, sink);
  if (id !== undefined && !isWellFormedId(id)) {
    sink.add("malformed-id", "Port ID is malformed", `${path}.id`, [id]);
  }
  if (!DIRECTIONS.has(raw.direction)) {
    sink.add(
      "invalid-shape",
      "direction must be input, output or undirected",
      `${path}.direction`,
    );
  }
  const typeKey = reqStr(raw, "typeKey", path, sink);
  const limit = raw.limit;
  if (
    limit !== undefined &&
    typeof limit !== "number" &&
    typeof limit !== "string"
  ) {
    sink.add(
      "invalid-limit",
      "limit must be an integer or unlimited",
      `${path}.limit`,
    );
  }
  const label = optStr(raw, "label", path, sink);
  const place =
    raw.placement === undefined
      ? undefined
      : placement(raw.placement, `${path}.placement`, sink);
  if (sink.count() > before || id === undefined || typeKey === undefined)
    return undefined;
  const port: PortSnapshot = {
    id,
    direction: raw.direction as PortSnapshot["direction"],
    typeKey,
    ...(limit === undefined ? {} : { limit: limit as AttachmentLimit }),
    ...(label === undefined ? {} : { label }),
    ...(place ? { placement: place } : {}),
  };
  if (!isWellFormedId(owner)) return port;
  const checked = validatePortRecord(portToRecord(port, owner));
  if (!checked.ok) {
    sink.add(
      checked.rejection.code,
      checked.rejection.message,
      path,
      checked.rejection.entities,
    );
    return undefined;
  }
  return port;
}

const NODE_KEYS = [
  "id",
  "type",
  "position",
  "size",
  "rotation",
  "mirrored",
  "z",
  "title",
  "status",
  "capabilities",
  "ports",
  "payload",
];

export function parseNode(
  raw: unknown,
  path: string,
  limits: SnapshotLimits,
  sink: ErrorSink,
): NodeSnapshot | undefined {
  if (!isObj(raw)) {
    sink.add("invalid-shape", "Node must be an object", path);
    return undefined;
  }
  const before = sink.count();
  onlyKeys(raw, NODE_KEYS, path, sink);
  const id = reqStr(raw, "id", path, sink);
  if (id !== undefined && !isWellFormedId(id)) {
    sink.add("malformed-id", "Node ID is malformed", `${path}.id`, [id]);
  }
  const type = reqStr(raw, "type", path, sink);
  const position = vec(raw.position, `${path}.position`, sink);
  const sizeRaw = raw.size;
  let size: NodeSnapshot["size"] | undefined;
  if (!isObj(sizeRaw))
    sink.add("invalid-shape", "size must be an object", `${path}.size`);
  else {
    onlyKeys(sizeRaw, ["width", "height"], `${path}.size`, sink);
    const width = num(sizeRaw, "width", `${path}.size`, sink);
    const height = num(sizeRaw, "height", `${path}.size`, sink);
    if (width !== undefined && height !== undefined) size = { width, height };
  }
  for (const key of ["rotation", "z"]) {
    if (raw[key] !== undefined && typeof raw[key] !== "number") {
      sink.add("invalid-shape", `${key} must be a number`, `${path}.${key}`);
    }
  }
  if (raw.mirrored !== undefined && typeof raw.mirrored !== "boolean") {
    sink.add("invalid-shape", "mirrored must be a boolean", `${path}.mirrored`);
  }
  const title = optStr(raw, "title", path, sink);
  const status = optStr(raw, "status", path, sink);
  const caps =
    raw.capabilities === undefined
      ? undefined
      : capabilities(raw.capabilities, `${path}.capabilities`, sink);
  if (!("payload" in raw)) {
    sink.add(
      "invalid-shape",
      "payload is required (use null for none)",
      `${path}.payload`,
    );
  } else {
    const problem = checkJson(
      raw.payload,
      `${path}.payload`,
      limits.maxPayloadDepth,
    );
    if (problem) {
      sink.add(
        problem.kind === "depth" ? "limit-exceeded" : "non-json-payload",
        problem.reason,
        problem.path,
        id === undefined ? [] : [id],
      );
    }
  }
  const ports: PortSnapshot[] = [];
  if (!Array.isArray(raw.ports)) {
    sink.add("invalid-shape", "ports must be an array", `${path}.ports`);
  } else if (raw.ports.length > limits.maxPortsPerNode) {
    sink.add(
      "limit-exceeded",
      `More than ${limits.maxPortsPerNode} ports on one node`,
      `${path}.ports`,
      id === undefined ? [] : [id],
    );
  } else {
    raw.ports.forEach((p: unknown, j: number) => {
      const port = parsePort(p, `${path}.ports[${j}]`, id ?? "", sink);
      if (port) ports.push(port);
    });
  }
  if (
    sink.count() > before ||
    id === undefined ||
    type === undefined ||
    !position ||
    !size
  )
    return undefined;
  const node: NodeSnapshot = {
    id,
    type,
    position,
    size,
    ...(raw.rotation === undefined
      ? {}
      : { rotation: raw.rotation as QuarterTurns }),
    ...(raw.mirrored === undefined
      ? {}
      : { mirrored: raw.mirrored as boolean }),
    ...(raw.z === undefined ? {} : { z: raw.z as number }),
    ...(title === undefined ? {} : { title }),
    ...(status === undefined ? {} : { status }),
    ...(caps ? { capabilities: caps } : {}),
    ports,
    payload: raw.payload as NodeSnapshot["payload"],
  };
  const dedupedPorts = [...new Set(ports.map((p) => p.id))];
  const checked = validateNodeRecord({
    ...nodeToRecord(node, null),
    ports: dedupedPorts,
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
  return node;
}
