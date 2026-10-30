# Design

## Context

See proposal.md for motivation. This change consumes the following and does not redefine
them:

- From `add-graph-model-core`: `NodeRecord`, `PortRecord`, `ConnectionRecord`, `Endpoint`,
  `PortDirection`, `AttachmentLimit`, `Payload`, `IdGenerator`/`IdCursor`, `GraphReader`,
  `Result`, `Rejection`/`RejectionCode`, and the internal `GraphStore`.
- From `add-patches-and-history`: `Patch`/`PatchOp`, `applyPatch`, the event hub, the local
  history, and `createGraphModel()`.
- From `add-commands-and-policy`: the node type registry, used only to detect unregistered
  types.

Core must typecheck without the DOM lib (`tsconfig.core.json`), so the snapshot code uses
only ES2022 globals. No validation library is added, because the core bundle budget is
75 KiB gzip.

## Goals / Non-Goals

**Goals:**
- One shape (`GraphSnapshot`) for save/load, fixtures, later clipboard fragments, and later
  snapshot-mode adapters.
- One validator for all untrusted input, reporting every error it finds.
- Deterministic export: equal state gives byte-identical JSON.
- Load as an atomic replace; a failed load changes nothing.
- A linear-time diff from the current read model to a target snapshot that produces a valid
  patch.

**Non-Goals:**
- A schema-migration framework. The format migrations rule is a SHOULD, so only a hook point is reserved.
- Streaming or incremental parsing of very large files.
- Paste semantics for fragments (Slice B).

## Decisions

### D1. Module layout (`src/core/io/snapshot/`)

| File | Responsibility |
| --- | --- |
| `snapshot-types.ts` | `GraphSnapshot`, `NodeSnapshot`, `PortSnapshot`, `ConnectionSnapshot`, reserved section types, `SnapshotError`, `SnapshotDiagnostic`, `FORMAT_VERSION` |
| `json-value.ts` | `JsonValue`, `checkJson(value, path)`, JSON deep equality |
| `snapshot-errors.ts` | Error collection and path ordering for the validator, `SnapshotLimits` and defaults, and the `PayloadCodec` registry keyed by node type |
| `validate-shape.ts` | Structural checks turning untrusted input into a typed `GraphSnapshot` |
| `validate.ts` | `validateSnapshot(input, options)`: shape, then references (duplicate IDs, dangling endpoints, port ownership, reserved-section checks), then limits; collects all errors |
| `records.ts` | Conversion between snapshot entries and model records |
| `export.ts` | `exportSnapshot(reader, options)`: deterministic snapshot of committed state |
| `load.ts` | `loadSnapshot(model, input, options)`: validate, then replace |
| `document.ts` | `saveDocument` / `loadDocument`: versioned JSON text wrapping the snapshot |
| `diff.ts` | `diffSnapshot(from: GraphReader, to: GraphSnapshot)`: produces a `Patch` |
| `index.ts` | Public exports |

Each file stays under 300 lines. The structural shape pass is the largest part of the
validator, so it has its own file; the reference pass sits next to the composition in
`validate.ts`.

### D2. Snapshot shape

Snapshot entries mirror the `add-graph-model-core` records field for field, so `records.ts`
is a thin mapping rather than a second vocabulary. Two differences exist. Ports are embedded
in their node, in presentation order, because the node owns port order. A port entry does
not repeat its `node` field.

```ts
type GraphSnapshot = {
  readonly format: "nodeeditor-js/graph";
  readonly version: 1;                                 // FORMAT_VERSION
  readonly idCursor?: IdCursor;                        // generator cursor, verbatim; omitted in fragments
  readonly nodes: readonly NodeSnapshot[];             // paint order: (z, seq) ascending
  readonly connections: readonly ConnectionSnapshot[]; // collection order (seq)
  readonly assemblies?: readonly [];                   // reserved, Slice C
  readonly references?: readonly [];                   // reserved, Slice C
  readonly groups?: readonly [];                       // reserved, Slice C
  readonly routes?: readonly [];                       // reserved, route constraints (Slice B)
};

type NodeSnapshot = {
  readonly id: string; readonly type: string;
  readonly position: Vec2; readonly size: Size;        // world units
  readonly rotation?: QuarterTurns;                    // omitted when 0
  readonly mirrored?: boolean;                         // omitted when false
  readonly z?: number;                                 // omitted when 0
  readonly title?: string; readonly status?: string;
  readonly capabilities?: CapabilityOverrides;
  readonly ports: readonly PortSnapshot[];             // presentation order
  readonly payload: JsonValue;
};

type PortSnapshot = {
  readonly id: string; readonly direction: PortDirection; readonly typeKey: string;
  readonly limit?: AttachmentLimit;                    // omitted when "unlimited"
  readonly label?: string; readonly placement?: PortPlacement;
};

type ConnectionSnapshot = {
  readonly id: string; readonly kind?: string;         // omitted when "default"
  readonly from: Endpoint; readonly to: Endpoint;
};
```

Omitting fields that hold their default value keeps output small and stable. Load fills the
defaults back in.

*Alternatives considered:*
- A map keyed by ID. Rejected because object key order is incidental, while arrays
  carry paint and presentation order explicitly.
- Ports as a separate top-level array. Rejected because the node owns port order and the
  embedded form is what hosts write by hand.

**Fragments.** A fragment is a `GraphSnapshot` without `idCursor`, whose connections
reference only nodes inside the fragment. The validator has a `fragment: true` option for
this. Paste semantics are Slice B.

### D3. Validator: collect all errors, typed result

`validateSnapshot(input: unknown, options?: { limits?, fragment? })` returns
`Result<GraphSnapshot, readonly SnapshotError[]>`.

`SnapshotError` extends the core `Rejection` (`code`, `message`, `entities`) with a JSON
`path` such as `nodes[3].ports[1].id`.

Error codes:

| Source | Codes |
| --- | --- |
| Reused from core's `RejectionCode` | `malformed-id`, `duplicate-id`, `non-finite`, `dangling-endpoint`, `port-node-mismatch`, `invalid-limit` |
| Added here | `invalid-shape`, `unsupported-format`, `unsupported-version`, `non-json-payload`, `limit-exceeded`, `unsupported-section` |

The shape pass runs first. Reference checks run only on structurally valid parts, so one
missing field does not cascade into dozens of reference errors. Errors are sorted by path,
which makes the output deterministic. Per-record checks reuse `data/model/validate-records.ts`,
so loaded records obey exactly the rules patches obey.

The validator is reused by `loadSnapshot`, `loadDocument`, fixtures, and later by
snapshot-mode adapters. It never throws on bad input, because bad input is an
expected failure.

*Alternative considered:* a schema library (zod, valibot). Rejected because of the bundle
budget, the core dependency policy, and the cross-reference checks a schema cannot express
anyway.

### D4. Limits

`SnapshotLimits` and their defaults:

| Limit | Default |
| --- | --- |
| `maxNodes` | 100 000 |
| `maxConnections` | 200 000 |
| `maxPortsPerNode` | 1 024 |
| `maxPayloadDepth` | 64 |
| `maxDocumentChars` (text input) | 64 Mi |

The defaults sit well above F-LARGE (10k nodes, 20k connections), and hosts can lower them.
`loadDocument` checks the text length before `JSON.parse`, so oversized input is rejected
without being parsed.

### D5. Deterministic export

`exportSnapshot(reader)` walks the `GraphReader` in its explicit orders:
- nodes in paint order `(z, seq)`,
- ports in `NodeRecord.ports` order,
- connections in collection order.

It builds each object with a fixed key insertion order. Payloads are copied as stored, never
re-sorted, so an unknown type's payload stays byte-identical. Stored payloads are
already JSON-compatible, so `JSON.stringify` of an export is stable for unchanged state.
The ID cursor is copied verbatim.

Viewport and selection options exist only on `saveDocument`. The snapshot itself never
carries view-local state.

### D6. Load is a reset, not an undoable patch

`loadSnapshot(model, input)` steps:
1. Validate.
2. Map entries to records with their defaults filled in.
3. Build a complete replacement store state off to the side.
4. Swap it in inside one store batch.
5. Emit one `reset` event. The `reset` event is owned by
   `add-patches-and-history`; it is also what resynchronization under revision continuity needs in Slice D.

On success:
- Local history is cleared.
- Nodes whose type is not registered produce `unresolved-type` diagnostics. These are
  separate from validation errors.
- The ID cursor becomes the snapshot's cursor, reconciled against the IDs present. The
  loader calls `IdGenerator.observe` (owned by `add-graph-model-core`) for every loaded ID,
  which advances each per-kind counter past it, so a hand-edited file cannot cause ID reuse. Host generators are
  opaque, so the cursor is used as-is.

On failure nothing changes: document, history, cursor, and listeners stay untouched, and no
event fires.

*Alternative considered:* loading as an undoable diff patch. Rejected for opening a file,
which the user does not expect to undo. The diff (D8) remains available for adapters that
want incremental updates.

### D7. Versioned document and payload codecs

`saveDocument(model, options)` returns `Result<string, SnapshotError[]>`. The JSON text has
this shape:

```json
{ "format": "nodeeditor-js/document", "version": 1, "graph": { "…GraphSnapshot…": 0 },
  "viewport": "optional", "selection": "optional" }
```

Payloads are encoded per node type through a `PayloadCodec` registry,
`{ encode(value): Result<JsonValue>; decode(json): Result<Payload> }`. Without a codec the
payload must pass `checkJson`. Otherwise save returns `non-json-payload` naming the node and
the field path, and nothing is dropped.

`loadDocument(model, text, options)` steps:
1. Check the text against the length limit.
2. `JSON.parse`; a parse failure maps to `invalid-shape`.
3. Check format and version. A newer version is `unsupported-version`; formats are never
   guessed.
4. Decode payloads with their codecs.
5. Call `loadSnapshot`.

Loading performs no I/O; asset references stay plain strings. Migrations
get a typed hook point, `migrations?: Readonly<Record<number, Migration>>`, but none ship in
this change.

### D8. Snapshot diff

`diffSnapshot(from: GraphReader, to: GraphSnapshot): Patch` reads the current records from
the reader and builds an ID map of `to`. It is O(n) and emits operations in an order that is
valid when applied atomically:

1. Remove connections that are absent from `to`.
2. Remove nodes absent from `to`, with their ports. Each remove carries the full record and
   its `seq`, as the `add-patches-and-history` patch format requires.
3. Add new nodes and their ports.
4. Update changed fields of surviving nodes and ports, with old and new values.
   This covers `position`, `size`, `rotation`, `mirrored`, `z`, `title`, `status`,
   `payload`, and the node's `ports` order.
5. Update connection endpoints in place when they changed. The connection keeps its ID,
   matching the patch design that allows `from`/`to` updates.
6. Add new connections.

Comparison uses JSON deep equality from `json-value.ts`, with a reference-equality shortcut.
Identical state gives an empty patch.

The `to` side carries no `seq`. Added entities get fresh `seq` values on apply, so a
snapshot-mode update orders new entities after existing ones. Paint order is still driven by
`z`.

*Alternative considered:* snapshot-to-snapshot diff. Rejected because remove operations need
the current `seq` and record, which only the reader has.

Correctness property, tested over seeded random graphs: applying `diffSnapshot(model, b)` and
exporting gives `b`, up to `seq` of new entities, which a canonical comparison ignores.
Applying the inverse restores the original export exactly.

## Risks / Trade-offs

- [The reader may not expose `seq`, which the remove operations need] → Depends on
  `GraphReader.seqOf(id)` from `add-graph-model-core` (alignment check in task 1.1).
- [The `reset` event and cursor reconciliation live in sibling modules] → Depends on
  `add-patches-and-history` (`reset`) and `add-graph-model-core` (`observe`); task 1.1 checks both.
- [Reserved sections are rejected when non-empty] → Explicit `unsupported-section` errors
  keep the "no silent loss" rule. Later slices replace the rejection with real validation.
- [Export cost for large graphs] → It is linear and payloads are shared by reference.
  `add-perf-baseline` measures export, validate, load, and diff on F-LARGE.

## Implementation notes (alignment with siblings)

- `GraphReader.seqOf`, the `reset` event with `EventHub.emitReset`, and
  `IdGenerator.observe` exist as designed; they were used, not extended.
- The facade had no way to replace the store, so a small internal hook was added:
  `LocalAdapter.replaceDocument(replacement)` (in `edit/adapter/replace-document.ts`), exposed
  as `GraphModelCore.replaceDocument`. `loadSnapshot` is the public entry point.
- Not-found uses the existing code `unknown-entity`; new rejection codes were added to
  `RejectionCode`: `invalid-shape`, `unsupported-format`, `unsupported-version`,
  `unsupported-section`, `non-json-payload`, `limit-exceeded`.
- The unresolved-type diagnostic has code `unresolved-type` and a JSON path; it is a
  separate type from `UnknownTypeDiagnostic` in `data/node-types/`.
- `loadSnapshot` replaces the model's ID cursor (it does not merge forward), then
  advances it past every loaded ID.
