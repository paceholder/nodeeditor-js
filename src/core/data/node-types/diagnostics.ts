/**
 * Placeholder diagnostics (NOD-07, model side).
 *
 * A node whose type is not registered stays in the model with its payload intact. This
 * query reports such nodes so a view can draw placeholders and a host can warn.
 */
import type { NodeId } from "../../base/ids/ids.js";
import type { GraphReader } from "../model/reader.js";
import type { NodeTypeRegistry } from "./registry.js";

export interface UnknownTypeDiagnostic {
  readonly code: "unknown-type";
  readonly node: NodeId;
  readonly type: string;
}

/** Nodes of unregistered types, in insertion order. */
export function findUnknownTypes(
  reader: GraphReader,
  registry: NodeTypeRegistry,
): readonly UnknownTypeDiagnostic[] {
  return reader
    .nodes()
    .filter((n) => !registry.has(n.type))
    .map((n) => ({ code: "unknown-type", node: n.id, type: n.type }));
}
