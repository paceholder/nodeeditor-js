# Proposal

## Why

Several later features need the same plain-object form of a graph: local save/load, test
and benchmark fixtures, clipboard fragments, and snapshot-mode adapters that receive a full
refetch from a host. If each of them had its own format, validation rules would drift
apart. This change defines the one graph snapshot, its validator, deterministic export, an
atomic replacing load, and a snapshot diff that produces a patch. Slice A needs them for
the local editor use case ("serialize the document, mount another view") and for the performance fixtures in
`add-perf-baseline`.

## What Changes

- Define the **graph snapshot** shape: format tag, format version, the ID generator cursor (high-water
  marks), ordered nodes with ordered ports and view data, connections, and reserved sections for
  assemblies, reference bindings, groups, and route constraints. Later slices fill those
  sections; this change only reserves and validates them.
- Add **one validator** for any untrusted input (plain object or parsed JSON). It reports
  structural errors, duplicate IDs, dangling endpoints, non-finite numbers, unsupported
  versions, non-JSON payloads, and size-limit violations. Each error has a code, a message,
  a JSON path, and the affected IDs. The validator collects every error, not just the first.
- Add **export**: the committed model state as a deterministic snapshot. Pending edits,
  previews, caches, viewport, and selection are excluded.
- Add **load**: a validated snapshot atomically replaces the model's document. It keeps
  unregistered node types as placeholders with untouched payloads, reconciles the ID cursor
  against the loaded IDs so deleted IDs stay retired, resets local history, and emits one
  `reset` event. A failed load changes
  nothing.
- Add the **versioned JSON document**: save/load wrapping the snapshot, with per-type
  payload codecs. JSON-compatible payloads are the default, other values are rejected
  explicitly, and viewport/selection sections are opt-in.
- Add the **snapshot diff**: the patch that turns the current read model (or a snapshot)
  into a target snapshot. It is the building block of snapshot-mode adapters;
  wiring it into an adapter is Slice D.
- Write documentation of the document format in `docs/format.md`.

Implements: the one graph snapshot shape rule, the shared snapshot validator rule, the snapshot export and load rule, the versioned local document format rule, the payload codecs rule, the excluded content rule, the validate-before-replace rule and the rule that unknown types are preserved (data side),
the deterministic round trip rule and the no network access on open rule (load performs no I/O), the unknown types and missing assets rule (data side: placeholder records and
diagnostics), the identifier generation rule (high-water mark persistence), the deterministic ordering rule (serialization order),
the structured structural errors rule (structured errors for imports).

### Out of scope

- Clipboard copy/paste, fragment ID remapping, and external-reference handling on paste.
  These come in Slice B. The shape already supports
  fragments: a fragment is a snapshot without an ID cursor.
- Snapshot-mode adapter wiring, pending-edit preservation, and revisioned sync (the snapshot synchronization rule,
  the revisioned synchronization rule and the revision continuity rule). These come in Slice D.
- Format migrations (SHOULD) beyond an explicit unsupported-version error.
- Contents of the reserved sections (assemblies, reference bindings, groups, route
  constraints). Until their capabilities land, a non-empty reserved section is rejected
  with an explicit `unsupported-section` error rather than dropped.
- Placeholder painting in the view (the view side of unknown types and missing assets); see `add-canvas-view-foundation`.

## Capabilities

### New Capabilities

None. The requirements already exist in the baseline specs `serialization`, `graph-model`,
and `node-types`. This change implements them without changing their behavior, so its
`.openspec.yaml` sets `skip_specs: true`.

### Modified Capabilities

None.

## Impact

- New module `src/core/io/snapshot/`. Its public exports are added to `src/core/index.ts`, and
  the existing `FORMAT_VERSION` constant moves into it.
- Depends on `add-graph-model-core` (records, ID generator and cursor, `GraphReader`, store batch;
  needs a read-only `seq` lookup for the diff),
  `add-patches-and-history` (patch type, atomic apply, event hub; this change adds a `reset` event), and
  `add-commands-and-policy` (node type registry, used to detect unregistered types).
- Used by `add-perf-baseline`, whose fixtures are graph snapshots.
- New documentation: `docs/format.md`.
- No new runtime dependencies, because validation is hand-written. Core stays headless.
