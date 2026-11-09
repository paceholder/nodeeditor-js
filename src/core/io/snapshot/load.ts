/**
 * Snapshot load.
 *
 * Load is a reset, not an undoable edit: the validated snapshot replaces the document in
 * one store batch, local history is cleared, and one `reset` event is emitted. Failed
 * input changes nothing and emits nothing. Nodes of unregistered types load unchanged and
 * are reported as diagnostics, never as errors. The ID cursor is advanced past every
 * loaded ID so a hand-edited file cannot cause ID reuse.
 */

import {
  EMPTY_CURSOR,
  type IdCursor,
  type IdGenerator,
} from "../../base/ids/id-generator.js";
import { err, ok, type Result } from "../../base/result.js";
import type { Revision } from "../../base/revision.js";
import type { NodeTypeRegistry } from "../../data/node-types/registry.js";
import type { DocumentReplacement } from "../../edit/adapter/replace-document.js";
import { cloneJson } from "./json-value.js";
import { connectionToRecord, nodeToRecord, portToRecord } from "./records.js";
import {
  createErrorSink,
  type PayloadCodecRegistry,
  resolveLimits,
  runCodec,
} from "./snapshot-errors.js";
import type {
  GraphSnapshot,
  SnapshotDiagnostic,
  SnapshotError,
} from "./snapshot-types.js";
import { type ValidateOptions, validateSnapshot } from "./validate.js";

/** What load needs from a model: `GraphModel` satisfies it. */
export interface SnapshotTarget {
  readonly registry?: NodeTypeRegistry;
  readonly idGenerator: IdGenerator;
  replaceDocument(replacement: DocumentReplacement): Revision;
}

export interface LoadOptions extends ValidateOptions {
  readonly codecs?: PayloadCodecRegistry;
}

export interface LoadReport {
  readonly revision: Revision;
  /** Unresolved node types and similar findings; the load still succeeded. */
  readonly diagnostics: readonly SnapshotDiagnostic[];
}

/** A fully validated and mapped load that has not touched the model yet. */
export interface PreparedLoad {
  readonly snapshot: GraphSnapshot;
  readonly replacement: DocumentReplacement;
  readonly diagnostics: readonly SnapshotDiagnostic[];
}

function reconcileCursor(
  generator: IdGenerator,
  snapshot: GraphSnapshot,
): IdCursor {
  let cursor: IdCursor = snapshot.idCursor ?? EMPTY_CURSOR;
  const observe = generator.observe;
  if (!observe) return cursor;
  for (const node of snapshot.nodes) {
    cursor = observe(node.id, cursor);
    for (const port of node.ports) cursor = observe(port.id, cursor);
  }
  for (const c of snapshot.connections) cursor = observe(c.id, cursor);
  return cursor;
}

/** Validate, decode payloads and map to records, without changing the model. */
export function prepareLoad(
  target: Pick<SnapshotTarget, "registry" | "idGenerator">,
  input: unknown,
  options: LoadOptions = {},
): Result<PreparedLoad, readonly SnapshotError[]> {
  const validated = validateSnapshot(input, options);
  if (!validated.ok) return validated;
  const snapshot = validated.value;
  const errors = createErrorSink(resolveLimits(options.limits).maxErrors);
  const diagnostics: SnapshotDiagnostic[] = [];
  const nodes = snapshot.nodes.map((node, i) => {
    if (target.registry && !target.registry.has(node.type)) {
      diagnostics.push({
        code: "unresolved-type",
        node: node.id,
        type: node.type,
        path: `nodes[${i}]`,
      });
    }
    const codec = options.codecs?.get(node.type);
    if (codec) {
      const decoded = runCodec(() => codec.decode(node.payload));
      if (decoded.ok) return nodeToRecord(node, decoded.value);
      errors.add(
        decoded.rejection.code,
        decoded.rejection.message,
        `nodes[${i}].payload`,
        [node.id, ...decoded.rejection.entities],
      );
    }
    return nodeToRecord(node, cloneJson(node.payload));
  });
  if (errors.count() > 0) return err(errors.report());
  return ok({
    snapshot,
    diagnostics,
    replacement: {
      nodes,
      ports: snapshot.nodes.flatMap((n) =>
        n.ports.map((p) => portToRecord(p, n.id)),
      ),
      connections: snapshot.connections.map(connectionToRecord),
      idCursor: reconcileCursor(target.idGenerator, snapshot),
    },
  });
}

/** Swap a prepared load into the model. Cannot fail on validated input. */
export function commitLoad(
  target: SnapshotTarget,
  prepared: PreparedLoad,
): LoadReport {
  const revision = target.replaceDocument(prepared.replacement);
  return { revision, diagnostics: prepared.diagnostics };
}

export function loadSnapshot(
  target: SnapshotTarget,
  input: unknown,
  options: LoadOptions = {},
): Result<LoadReport, readonly SnapshotError[]> {
  const prepared = prepareLoad(target, input, options);
  return prepared.ok ? ok(commitLoad(target, prepared.value)) : prepared;
}
