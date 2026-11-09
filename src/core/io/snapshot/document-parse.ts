/**
 * Document wrapper checks.
 *
 * Format tag and version are checked before anything else is read; an unknown or newer
 * version is an error and is never guessed. Migrations are supplied by the host as
 * functions and are never read from the document.
 */

import { isWellFormedId } from "../../base/ids/ids.js";
import { err, ok, type Result } from "../../base/result.js";
import {
  inWorldRange,
  MAX_WORLD_COORD,
  MAX_ZOOM,
  MIN_ZOOM,
} from "../../data/model/values.js";
import {
  createErrorSink,
  type ErrorSink,
  guarded,
  thrownMessage,
} from "./snapshot-errors.js";
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

type Migrated = Result<
  { doc: WrappedDocument; warnings: readonly string[] },
  readonly SnapshotError[]
>;

/** Check the document wrapper and run host migrations; never throws. */
export function runMigrations(
  parsed: unknown,
  migrations: Readonly<Record<number, Migration>> = {},
): Migrated {
  return guarded(() => migrate(parsed, migrations));
}

function migrate(
  parsed: unknown,
  migrations: Readonly<Record<number, Migration>>,
): Migrated {
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
    let next: ReturnType<Migration>;
    try {
      next = step(doc);
    } catch (thrown) {
      return err([
        error(
          "invalid-shape",
          `Migration from version ${version} failed: ${thrownMessage(thrown)}`,
          "version",
        ),
      ]);
    }
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
  // Read the sections here, inside the guard, so a getter cannot throw later.
  const wrapped: WrappedDocument = {
    graph: doc.graph,
    ...(doc.viewport === undefined ? {} : { viewport: doc.viewport }),
    ...(doc.selection === undefined ? {} : { selection: doc.selection }),
  };
  return ok({ doc: wrapped, warnings });
}

/** The viewport section: only `x`, `y` and `zoom`, inside the supported ranges. */
function parseViewport(
  v: unknown,
  sink: ErrorSink,
): DocumentViewportData | undefined {
  if (typeof v !== "object" || v === null || Array.isArray(v)) {
    sink.add("invalid-shape", "viewport must be an object", "viewport");
    return undefined;
  }
  const o = v as Record<string, unknown>;
  const before = sink.count();
  for (const key of Object.keys(o)) {
    if (!["x", "y", "zoom"].includes(key))
      sink.add("invalid-shape", `Unknown field "${key}"`, `viewport.${key}`);
  }
  const read = (
    key: "x" | "y" | "zoom",
    ok: (n: number) => boolean,
    range: string,
  ) => {
    const n = o[key];
    if (typeof n !== "number" || !Number.isFinite(n)) {
      sink.add(
        "invalid-shape",
        `viewport ${key} must be a finite number`,
        `viewport.${key}`,
      );
    } else if (!ok(n)) {
      sink.add(
        "out-of-range",
        `viewport ${key} must be ${range}`,
        `viewport.${key}`,
      );
    }
    return n as number;
  };
  const world = `within +-${MAX_WORLD_COORD}`;
  const x = read("x", inWorldRange, world);
  const y = read("y", inWorldRange, world);
  const zoom = read(
    "zoom",
    (z) => z >= MIN_ZOOM && z <= MAX_ZOOM,
    `from ${MIN_ZOOM} to ${MAX_ZOOM}`,
  );
  return sink.count() > before ? undefined : { x, y, zoom };
}

/** The selection section: unique IDs of nodes and connections of the graph. */
function parseSelection(
  s: unknown,
  graph: GraphSnapshot,
  sink: ErrorSink,
): string[] | undefined {
  if (!Array.isArray(s) || !s.every(isWellFormedId)) {
    sink.add("invalid-shape", "selection must be an array of IDs", "selection");
    return undefined;
  }
  const known = new Set<string>();
  for (const n of graph.nodes) known.add(n.id);
  for (const c of graph.connections) known.add(c.id);
  const seen = new Set<string>();
  const before = sink.count();
  s.forEach((id: string, i: number) => {
    if (seen.has(id)) {
      sink.add(
        "duplicate-id",
        `ID ${id} is selected twice`,
        `selection[${i}]`,
        [id],
      );
    } else if (!known.has(id)) {
      sink.add(
        "dangling-reference",
        `Selected ID ${id} does not exist`,
        `selection[${i}]`,
        [id],
      );
    }
    seen.add(id);
  });
  return sink.count() > before ? undefined : [...s];
}

/** Validate the optional viewport and selection sections against the graph. */
export function parseExtras(
  raw: { readonly viewport?: unknown; readonly selection?: unknown },
  graph: GraphSnapshot,
  maxErrors?: number,
): Result<DocumentExtras, readonly SnapshotError[]> {
  const sink = createErrorSink(maxErrors);
  const viewport =
    raw.viewport === undefined ? undefined : parseViewport(raw.viewport, sink);
  const selection =
    raw.selection === undefined
      ? undefined
      : parseSelection(raw.selection, graph, sink);
  if (sink.count() > 0) return err(sink.report());
  return ok({
    ...(viewport ? { viewport } : {}),
    ...(selection ? { selection } : {}),
  });
}
