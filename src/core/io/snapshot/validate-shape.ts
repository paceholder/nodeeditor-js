/**
 * Structural pass of the snapshot validator.
 *
 * Turns untrusted input into typed, normalized parts. It records every structural problem
 * it finds. Entries that fail are left out of the parts; their IDs go into `skipped` so
 * the reference pass does not report dependent "dangling" errors for them.
 */
import type { IdCursor } from "../../base/ids/id-generator.js";
import { parseConnection } from "./parse-connection.js";
import { parseNode } from "./parse-entries.js";
import { isObj, type Obj, onlyKeys } from "./parse-fields.js";
import type { ErrorSink, SnapshotLimits } from "./snapshot-errors.js";
import {
  type ConnectionSnapshot,
  FORMAT_VERSION,
  type NodeSnapshot,
  SNAPSHOT_FORMAT,
} from "./snapshot-types.js";

export interface Item<T> {
  readonly path: string;
  readonly value: T;
}

export interface ShapeParts {
  readonly cursor: IdCursor | undefined;
  readonly nodes: readonly Item<NodeSnapshot>[];
  readonly connections: readonly Item<ConnectionSnapshot>[];
  /** IDs declared by entries that failed the shape pass. */
  readonly skipped: ReadonlySet<string>;
  /** True when the node list was not read (size limit): endpoints cannot be checked. */
  readonly nodesUnread: boolean;
}

export interface ShapeOptions {
  readonly limits: SnapshotLimits;
  readonly fragment: boolean;
}

const RESERVED = ["assemblies", "references", "groups", "routes"] as const;
const TOP_KEYS = [
  "format",
  "version",
  "idCursor",
  ...RESERVED,
  "nodes",
  "connections",
];

function parseCursor(value: unknown, sink: ErrorSink): IdCursor | undefined {
  if (!isObj(value)) {
    sink.add("invalid-shape", "idCursor must be an object", "idCursor");
    return undefined;
  }
  const out: Record<string, number | string> = {};
  let good = true;
  for (const [key, v] of Object.entries(value)) {
    if (
      typeof v === "string" ||
      (typeof v === "number" && Number.isFinite(v))
    ) {
      out[key] = v;
    } else {
      sink.add(
        "invalid-shape",
        "idCursor values must be finite numbers or strings",
        `idCursor.${key}`,
      );
      good = false;
    }
  }
  return good ? out : undefined;
}

function declaredIds(raw: unknown, into: Set<string>): void {
  if (!isObj(raw)) return;
  if (typeof raw.id === "string") into.add(raw.id);
  if (Array.isArray(raw.ports)) {
    for (const p of raw.ports) declaredIds(p, into);
  }
}

function parseList<T>(
  raw: unknown,
  name: string,
  max: number,
  sink: ErrorSink,
  parse: (entry: unknown, path: string) => T | undefined,
  skipped: Set<string>,
): Item<T>[] {
  if (!Array.isArray(raw)) {
    sink.add("invalid-shape", `${name} must be an array`, name);
    return [];
  }
  if (raw.length > max) {
    sink.add(
      "limit-exceeded",
      `${name} holds ${raw.length} entries; the limit is ${max}`,
      name,
    );
    return [];
  }
  const items: Item<T>[] = [];
  raw.forEach((entry: unknown, i: number) => {
    const path = `${name}[${i}]`;
    const value = parse(entry, path);
    if (value === undefined) declaredIds(entry, skipped);
    else items.push({ path, value });
  });
  return items;
}

/**
 * Check format tag and version first. A wrong tag or unsupported version stops the pass
 * (nothing else in the input can be trusted); it yields undefined.
 */
export function parseShape(
  input: unknown,
  options: ShapeOptions,
  sink: ErrorSink,
): ShapeParts | undefined {
  if (!isObj(input)) {
    sink.add("invalid-shape", "A snapshot must be an object", "");
    return undefined;
  }
  const o: Obj = input;
  if (o.format !== SNAPSHOT_FORMAT) {
    sink.add(
      "unsupported-format",
      `Expected format "${SNAPSHOT_FORMAT}"`,
      "format",
    );
    return undefined;
  }
  if (o.version !== FORMAT_VERSION) {
    sink.add(
      "unsupported-version",
      `Snapshot version ${String(o.version)} is not supported; this library reads version ${FORMAT_VERSION}`,
      "version",
    );
    return undefined;
  }
  onlyKeys(o, TOP_KEYS, "", sink);
  let cursor: IdCursor | undefined;
  if (o.idCursor !== undefined) {
    if (options.fragment) {
      sink.add("invalid-shape", "A fragment carries no ID cursor", "idCursor");
    } else cursor = parseCursor(o.idCursor, sink);
  }
  for (const name of RESERVED) {
    const section = o[name];
    if (section === undefined) continue;
    if (!Array.isArray(section)) {
      sink.add("invalid-shape", `${name} must be an array`, name);
    } else if (section.length > 0) {
      sink.add(
        "unsupported-section",
        `Section "${name}" is reserved and must be empty in this version`,
        name,
      );
    }
  }
  const skipped = new Set<string>();
  const nodes = parseList(
    o.nodes,
    "nodes",
    options.limits.maxNodes,
    sink,
    (entry, path) => parseNode(entry, path, options.limits, sink),
    skipped,
  );
  const connections = parseList(
    o.connections,
    "connections",
    options.limits.maxConnections,
    sink,
    (entry, path) => parseConnection(entry, path, sink),
    skipped,
  );
  return {
    cursor,
    nodes,
    connections,
    skipped,
    nodesUnread:
      !Array.isArray(o.nodes) || o.nodes.length > options.limits.maxNodes,
  };
}
