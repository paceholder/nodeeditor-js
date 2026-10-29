/**
 * Versioned JSON document.
 *
 * `saveDocument` wraps the exported snapshot, encoding payloads through codecs. Viewport
 * and selection are written only when the caller passes them. `loadDocument` checks the
 * text length before parsing, parses, checks format and version (never guessing), and
 * hands the graph to the snapshot loader. Loading performs no I/O: asset references stay
 * plain strings inside payloads.
 */
import { err, ok, type Rejection, type Result } from "../../base/result.js";
import {
  type DocumentViewportData,
  type Migration,
  parseExtras,
  runMigrations,
} from "./document-parse.js";
import { exportSnapshot, type SnapshotSource } from "./export.js";
import { checkJson } from "./json-value.js";
import {
  commitLoad,
  type LoadOptions,
  type LoadReport,
  prepareLoad,
  type SnapshotTarget,
} from "./load.js";
import {
  type PayloadCodecRegistry,
  prefixError,
  resolveLimits,
  type SnapshotLimits,
} from "./snapshot-errors.js";
import {
  DOCUMENT_FORMAT,
  FORMAT_VERSION,
  type GraphSnapshot,
  type SnapshotError,
} from "./snapshot-types.js";

/** View-local state that a host may choose to store with the document. */
export type DocumentViewport = DocumentViewportData;

export interface SaveOptions {
  readonly codecs?: PayloadCodecRegistry;
  readonly limits?: Partial<SnapshotLimits>;
  /** Opt-in viewport section. */
  readonly viewport?: DocumentViewport;
  /** Opt-in selection section: IDs that exist in the graph. */
  readonly selection?: readonly string[];
  /** Passed to `JSON.stringify` as indentation. Defaults to compact output. */
  readonly indent?: number;
}

export interface LoadDocumentOptions extends LoadOptions {
  /** Host-supplied migrations from version N to N + 1. Never read from the document. */
  readonly migrations?: Readonly<Record<number, Migration>>;
}

export interface DocumentLoadReport extends LoadReport {
  readonly viewport?: DocumentViewport;
  readonly selection?: readonly string[];
  /** Warnings returned by migrations. */
  readonly warnings: readonly string[];
}

function encodePayloads(
  snapshot: GraphSnapshot,
  options: SaveOptions,
): Result<GraphSnapshot, readonly SnapshotError[]> {
  const errors: SnapshotError[] = [];
  const depth = resolveLimits(options.limits).maxPayloadDepth;
  const nodes = snapshot.nodes.map((node, i) => {
    const path = `nodes[${i}].payload`;
    const codec = options.codecs?.get(node.type);
    if (codec) {
      const encoded = codec.encode(node.payload);
      if (encoded.ok) return { ...node, payload: encoded.value };
      const e: Rejection = encoded.error;
      errors.push({ ...e, path, entities: [node.id, ...e.entities] });
      return node;
    }
    const problem = checkJson(node.payload, path, depth);
    if (problem) {
      errors.push({
        code: problem.kind === "depth" ? "limit-exceeded" : "non-json-payload",
        message: `Payload of node ${node.id} cannot be saved: ${problem.reason} (register a codec for type ${node.type})`,
        path: problem.path,
        entities: [node.id],
      });
    }
    return node;
  });
  return errors.length > 0 ? err(errors) : ok({ ...snapshot, nodes });
}

export function saveDocument(
  source: SnapshotSource,
  options: SaveOptions = {},
): Result<string, readonly SnapshotError[]> {
  const encoded = encodePayloads(exportSnapshot(source), options);
  if (!encoded.ok)
    return err(encoded.error.map((e) => prefixError(e, "graph")));
  const extras = parseExtras(
    { viewport: options.viewport, selection: options.selection },
    encoded.value,
  );
  if (!extras.ok) return extras;
  const doc = {
    format: DOCUMENT_FORMAT,
    version: FORMAT_VERSION,
    graph: encoded.value,
    ...(extras.value.viewport ? { viewport: extras.value.viewport } : {}),
    ...(extras.value.selection ? { selection: extras.value.selection } : {}),
  };
  return ok(JSON.stringify(doc, null, options.indent));
}

const fail = (
  code: SnapshotError["code"],
  message: string,
  path = "",
): Result<never, readonly SnapshotError[]> =>
  err([{ code, message, path, entities: [] }]);

export function loadDocument(
  target: SnapshotTarget,
  text: string,
  options: LoadDocumentOptions = {},
): Result<DocumentLoadReport, readonly SnapshotError[]> {
  if (typeof text !== "string") {
    return fail("invalid-shape", "A document must be provided as text");
  }
  const max = resolveLimits(options.limits).maxDocumentChars;
  if (text.length > max) {
    return fail(
      "limit-exceeded",
      `Document has ${text.length} characters; the limit is ${max}`,
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    return fail(
      "invalid-shape",
      `Document is not valid JSON: ${e instanceof Error ? e.message : "parse error"}`,
    );
  }
  const migrated = runMigrations(parsed, options.migrations);
  if (!migrated.ok) return migrated;
  const { doc, warnings } = migrated.value;
  const prepared = prepareLoad(target, doc.graph, options);
  if (!prepared.ok)
    return err(prepared.error.map((e) => prefixError(e, "graph")));
  const extras = parseExtras(doc, prepared.value.snapshot);
  if (!extras.ok) return extras;
  const report = commitLoad(target, prepared.value);
  return ok({ ...report, ...extras.value, warnings });
}
