/**
 * The one snapshot validator.
 *
 * Shape pass first, then references on the valid parts, with size limits applied inside
 * both. Every error found is reported, sorted by JSON path. Bad input never throws.
 */
import { err, ok, type Result } from "../../base/result.js";
import {
  createErrorSink,
  type ErrorSink,
  resolveLimits,
  type SnapshotLimits,
  thrownMessage,
} from "./snapshot-errors.js";
import {
  FORMAT_VERSION,
  type GraphSnapshot,
  SNAPSHOT_FORMAT,
  type SnapshotError,
} from "./snapshot-types.js";
import { parseShape, type ShapeParts } from "./validate-shape.js";

export interface ValidateOptions {
  readonly limits?: Partial<SnapshotLimits>;
  /** Fragments carry no ID cursor (clipboard use; paste itself is a later change). */
  readonly fragment?: boolean;
}

export function validateSnapshot(
  input: unknown,
  options: ValidateOptions = {},
): Result<GraphSnapshot, readonly SnapshotError[]> {
  const sink = createErrorSink(resolveLimits(options.limits).maxErrors);
  const snapshot = validateSnapshotInto(input, options, sink);
  return snapshot ? ok(snapshot) : err(sink.report());
}

/**
 * The validator writing into a caller's sink, for callers that check more around the
 * snapshot (fragments). Returns the snapshot when this input added no error.
 */
export function validateSnapshotInto(
  input: unknown,
  options: ValidateOptions,
  sink: ErrorSink,
): GraphSnapshot | undefined {
  const before = sink.count();
  let parts: ShapeParts | undefined;
  try {
    parts = parseShape(
      input,
      {
        limits: resolveLimits(options.limits),
        fragment: options.fragment === true,
      },
      sink,
    );
    if (parts) checkReferences(parts, sink);
  } catch (error) {
    // A getter or proxy in the input threw: report it, never throw.
    sink.add(
      "invalid-shape",
      `The input could not be read: ${thrownMessage(error)}`,
      "",
    );
  }
  if (sink.count() > before || !parts) return undefined;
  return {
    format: SNAPSHOT_FORMAT,
    version: FORMAT_VERSION,
    ...(parts.cursor ? { idCursor: parts.cursor } : {}),
    nodes: parts.nodes.map((n) => n.value),
    connections: parts.connections.map((c) => c.value),
    ...(parts.groups.length > 0
      ? { groups: parts.groups.map((g) => g.value) }
      : {}),
  };
}

/**
 * Reference pass of the snapshot validator.
 *
 * Runs on the structurally valid parts only: duplicate IDs across all entity kinds,
 * dangling connection endpoints, endpoint ports that belong to another node, nodes that
 * name a missing group, and groups that no node names. For a fragment the same checks
 * make every connection and membership reference only entities inside it.
 */
export function checkReferences(parts: ShapeParts, sink: ErrorSink): void {
  const seen = new Map<string, string>();
  const portOwner = new Map<string, string>();
  const nodeIds = new Set<string>();
  const claim = (id: string, path: string): boolean => {
    const first = seen.get(id);
    if (first === undefined) {
      seen.set(id, path);
      return true;
    }
    sink.add(
      "duplicate-id",
      `ID ${id} is already used at ${first}`,
      `${path}.id`,
      [id],
    );
    return false;
  };
  for (const { path, value: node } of parts.nodes) {
    if (claim(node.id, path)) nodeIds.add(node.id);
    node.ports.forEach((port, j) => {
      if (claim(port.id, `${path}.ports[${j}]`))
        portOwner.set(port.id, node.id);
    });
  }
  const groupIds = new Set<string>();
  for (const { path, value: group } of parts.groups) {
    if (claim(group.id, path)) groupIds.add(group.id);
  }
  const named = new Set<string>();
  for (const { path, value: node } of parts.nodes) {
    if (node.group === undefined) continue;
    named.add(node.group);
    if (!groupIds.has(node.group) && !parts.skipped.has(node.group)) {
      sink.add(
        "dangling-reference",
        `Group ${node.group} does not exist`,
        `${path}.group`,
        [node.id, node.group],
      );
    }
  }
  for (const { path, value: group } of parts.groups) {
    if (!named.has(group.id) && !parts.nodesUnread) {
      sink.add("dangling-reference", `Group ${group.id} has no members`, path, [
        group.id,
      ]);
    }
  }
  for (const { path, value: c } of parts.connections) {
    claim(c.id, path);
    for (const side of ["from", "to"] as const) {
      const end = c[side];
      const at = `${path}.${side}`;
      if (!nodeIds.has(end.node)) {
        if (!parts.skipped.has(end.node) && !parts.nodesUnread) {
          sink.add(
            "dangling-endpoint",
            `Node ${end.node} does not exist`,
            `${at}.node`,
            [c.id, end.node],
          );
        }
        continue;
      }
      const owner = portOwner.get(end.port);
      if (owner === undefined) {
        if (!parts.skipped.has(end.port) && !parts.nodesUnread) {
          sink.add(
            "dangling-endpoint",
            `Port ${end.port} does not exist`,
            `${at}.port`,
            [c.id, end.port],
          );
        }
      } else if (owner !== end.node) {
        sink.add(
          "port-node-mismatch",
          "Endpoint port belongs to another node",
          at,
          [c.id, end.port, end.node],
        );
      }
    }
  }
}
