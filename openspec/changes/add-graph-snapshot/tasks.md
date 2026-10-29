# Tasks

## 1. Alignment and types

- [ ] 1.1 Confirm alignment with implemented siblings: snapshot entries match `NodeRecord`/`PortRecord`/`ConnectionRecord` field names, `GraphReader.seqOf` (`add-graph-model-core`), the `reset` event (`add-patches-and-history`), and `IdGenerator.observe` (`add-graph-model-core`) exist as implemented, so this change depends on them rather than extending them; record any adjustment in `design.md` and verify by `npm run typecheck`
- [ ] 1.2 Create `src/core/io/snapshot/snapshot-types.ts` with `GraphSnapshot`, node/port/connection snapshot types, reserved sections, `SnapshotError`, `SnapshotDiagnostic`, and move `FORMAT_VERSION` there; verify `npm run typecheck` (including the core-only pass) and that `src/core/index.test.ts` still passes
- [ ] 1.3 Implement `json-value.ts` (`checkJson`, JSON deep equality) with tests in `json-value.test.ts` titled with SER-02 covering Date, Map, undefined, functions, NaN/Infinity, cycles, and nested plain data; verify `npx vitest run src/core/io/snapshot/json-value.test.ts`

## 2. Validator

- [ ] 2.1 Implement the limits in `snapshot-errors.ts` and `validate-shape.ts` (format tag, version, required fields, field types, finite numbers, quarter-turn rotation, port direction enum) with tests in `validate-shape.test.ts` titled with SNP-02 and SER-04; verify every error carries code, message, JSON path, and IDs
- [ ] 2.2 Implement the reference pass (`checkReferences` in `validate.ts`: duplicate IDs across all entity kinds, dangling endpoints, port-owner mismatch, fragment-internal references, non-empty reserved section → `unsupported-section`) with tests titled SNP-02, MOD-09; verify a snapshot with a duplicate node ID and a dangling connection reports both errors in deterministic path order
- [ ] 2.3 Implement `validate.ts` composing the passes plus limits (`limit-exceeded` for node, connection, port, and payload depth limits) with tests titled SNP-02, SER-04; verify invalid input never throws and valid input returns the typed snapshot

## 3. Export

- [ ] 3.1 Implement `export.ts` with deterministic order and fixed key order, omitting defaulted fields; tests in `export.test.ts` titled SNP-01, SNP-03, SER-06, MOD-08 verify the same edit sequence on two fresh models gives identical `JSON.stringify` output and that the snapshot survives a JSON round trip deeply equal
- [ ] 3.2 Add tests titled SER-03, MOD-04 verifying that export during an active pending/preview state contains committed state only and never viewport or selection

## 4. Load

- [ ] 4.1 Implement `load.ts` (validate → map records → build → swap in one store batch → single `reset` event → history cleared) with tests in `load.test.ts` titled SNP-03, MOD-05; verify a loaded fresh model answers entity and adjacency queries identically to the source model
- [ ] 4.2 Add failure tests titled SER-04 verifying that a failed load leaves the document, history, and change listeners untouched (no event emitted)
- [ ] 4.3 Implement unresolved-type diagnostics and opaque payload retention; tests titled SER-05, NOD-07 verify a node of an unregistered type loads, appears in diagnostics (not errors), and re-exports with identical type key and payload text
- [ ] 4.4 Implement ID cursor reconciliation on load; tests titled MOD-03a verify that after loading a snapshot whose highest node `n9` was deleted (cursor past 9), and a hand-edited snapshot containing `n12` with a cursor at 9, the next created node ID is never an existing or retired one

## 5. Versioned document and codecs

- [ ] 5.1 Implement the payload codec registry (in `snapshot-errors.ts`) and `document.ts` (`saveDocument`, `loadDocument`, length check before parse, format/version check, opt-in viewport/selection sections) with tests in `document.test.ts` titled SER-01, SER-02, SER-03; verify a Date payload without codec is rejected naming node and path, and with a registered codec round-trips
- [ ] 5.2 Add tests titled SER-05, SER-06 verifying a future version is rejected as `unsupported-version` and that load → save of an unchanged document yields an identical string
- [ ] 5.3 Add a test titled SER-08 that replaces `globalThis.fetch` with a spy, loads a document containing asset reference strings, and verifies the spy is never called

## 6. Snapshot diff

- [ ] 6.1 Implement `diff.ts` with the D8 operation order using the `Patch` type from `add-patches-and-history`; tests in `diff.test.ts` titled ADP-05, PAT-01 verify identical snapshots give an empty patch and a single moved node gives exactly one update with old and new position
- [ ] 6.2 Add a seeded property test titled ADP-05, PAT-03 over 200 random graph pairs verifying that applying `diffSnapshot(model(a), b)` exports `b` (canonical comparison ignoring new-entity `seq`) and applying the inverse restores `a`; verify `npx vitest run src/core/io/snapshot/diff.test.ts`
- [ ] 6.3 Add tests titled MOD-08, CON-08 verifying port-order and `z` differences produce node field updates and a changed endpoint produces an in-place connection update keeping its ID

## 7. Public API and documentation

- [ ] 7.1 Export the snapshot API from `src/core/index.ts`; verify `npm run build` emits the declarations and a Node import of `dist/core/index.js` exposes `validateSnapshot`, `exportSnapshot`, `loadSnapshot`, `saveDocument`, `loadDocument`, `diffSnapshot`
- [ ] 7.2 Write `docs/format.md` describing the document and snapshot shape, ordering rules, ID high-water marks, error codes, limits, codecs, and fragments; verify every error code in `snapshot-types.ts` is listed in the document
- [ ] 7.3 Run `npm run typecheck && npm test && npm run lint` and verify all pass with each snapshot file under 300 lines

## Workflow follow-up

- Archive the change after review with `/opsx:archive add-graph-snapshot`.
