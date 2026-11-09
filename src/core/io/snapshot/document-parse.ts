/**
 * Document wrapper checks.
 *
 * Format tag and version are checked before anything else is read; an unknown or newer
 * version is an error and is never guessed. Migrations are supplied by the host as
 * functions and are never read from the document.
 */

import { isWellFormedId } from "../../base/ids/ids.js";
import { err, ok, type Result } from "../../base/result.js";
import { createErrorSink } from "./snapshot-errors.js";
import {
  DOCUMENT_FORMAT,
  FORMAT_VERSION,
  type GraphSnapshot,
  type SnapshotError,
} from "./snapshot-types.js";

export interface DocumentViewportData {
  readonly x: number;
  readonly y: number;
  readonly zoom: number;
}

export interface DocumentExtras {
  readonly viewport?: DocumentViewportData;
  readonly selection?: readonly string[];
}

/** Upgrade a document one version (N to N + 1), returning warnings. */
export type Migration = (doc: Record<string, unknown>) => Result<
  {
    readonly doc: Record<string, unknown>;
    readonly warnings: readonly string[];
  },
  readonly SnapshotError[]
>;

export interface WrappedDocument {
  readonly graph: unknown;
  readonly viewport?: unknown;
  readonly selection?: unknown;
}

const error = (
  code: SnapshotError["code"],
  message: string,
  path: string,
  entities: readonly string[] = [],
): SnapshotError => ({ code, message, path, entities });

export function runMigrations(
  parsed: unknown,
  migrations: Readonly<Record<number, Migration>> = {},
): Result<
  { doc: WrappedDocument; warnings: readonly string[] },
  readonly SnapshotError[]
> {
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return err([error("invalid-shape", "A document must be an object", "")]);
  }
  let doc = parsed as Record<string, unknown>;
  if (doc.format !== DOCUMENT_FORMAT) {
    return err([
      error(
        "unsupported-format",
        `Expected format "${DOCUMENT_FORMAT}"`,
        "format",
      ),
    ]);
  }
  const warnings: string[] = [];
  while (doc.version !== FORMAT_VERSION) {
    const version = doc.version;
    const step =
      typeof version === "number" && version < FORMAT_VERSION
        ? migrations[version]
        : undefined;
    if (!step || typeof version !== "number") {
      return err([
        error(
          "unsupported-version",
          `Document version ${String(version)} is not supported; this library reads version ${FORMAT_VERSION}`,
          "version",
        ),
      ]);
    }
    const next = step(doc);
    if (!next.ok) return next;
    if (next.value.doc.version !== version + 1) {
      return err([
        error(
          "unsupported-version",
          `Migration from version ${version} did not advance the version`,
          "version",
        ),
      ]);
    }
    doc = next.value.doc;
    warnings.push(...next.value.warnings);
  }
  for (const key of Object.keys(doc)) {
    if (
      !["format", "version", "graph", "viewport", "selection"].includes(key)
    ) {
      return err([error("invalid-shape", `Unknown field "${key}"`, key)]);
    }
  }
  return ok({ doc: doc as unknown as WrappedDocument, warnings });
}

/** Validate the optional viewport and selection sections against the graph. */
export function parseExtras(
  raw: { readonly viewport?: unknown; readonly selection?: unknown },
  graph: GraphSnapshot,
  maxErrors?: number,
): Result<DocumentExtras, readonly SnapshotError[]> {
  const sink = createErrorSink(maxErrors);
  const errors = {
    push: (e: SnapshotError) => sink.add(e.code, e.message, e.path, e.entities),
  };
  let viewport: DocumentViewportData | undefined;
  const v = raw.viewport;
  if (v !== undefined) {
    const o = v as Record<string, unknown> | null;
    if (
      typeof o !== "object" ||
      o === null ||
      ![o.x, o.y, o.zoom].every(
        (n) => typeof n === "number" && Number.isFinite(n),
      ) ||
      (o.zoom as number) <= 0
    ) {
      errors.push(
        error(
          "invalid-shape",
          "viewport needs finite x, y and a positive zoom",
          "viewport",
        ),
      );
    } else {
      viewport = { x: o.x as number, y: o.y as number, zoom: o.zoom as number };
    }
  }
  let selection: string[] | undefined;
  const s = raw.selection;
  if (s !== undefined) {
    if (!Array.isArray(s) || !s.every(isWellFormedId)) {
      errors.push(
        error(
          "invalid-shape",
          "selection must be an array of IDs",
          "selection",
        ),
      );
    } else {
      const known = new Set<string>();
      for (const n of graph.nodes) known.add(n.id);
      for (const c of graph.connections) known.add(c.id);
      selection = [];
      s.forEach((id: string, i: number) => {
        if (known.has(id)) selection?.push(id);
        else
          errors.push(
            error(
              "dangling-reference",
              `Selected ID ${id} does not exist`,
              `selection[${i}]`,
              [id],
            ),
          );
      });
    }
  }
  if (sink.count() > 0) return err(sink.report());
  return ok({
    ...(viewport ? { viewport } : {}),
    ...(selection ? { selection } : {}),
  });
}
