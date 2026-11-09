# Tasks

Each task is one fix with the test that proves it. The test is written first from the
audit's scenario and must fail before the fix. Every task's commit passes `npm run lint`,
`npm run typecheck` and `npm test`.

## 1. Model integrity (core/data)

- [x] 1.1 Orphaned ports: the patch integrity check rejects a node `ports` update that drops a port still owned by the node, and the store's consistency check re-verifies ports a node used to list; verify `src/core/data/patch/apply-atomic.test.ts` and `src/core/data/model/store.test.ts` cases titled "every port keeps an owning node"
- [x] 1.2 Own keys only: update fields are checked with `Object.hasOwn`, patch ID cursors must be plain objects of safe integers or text with no `__proto__` key, and cursor merging defines keys safely (D6, D7); verify `src/core/data/patch/own-keys.test.ts` cases titled "update fields are the record's own fields"
- [x] 1.3 Explicit sequence: bounded to 2^40 and unique per kind among live and staged entities (D11); `GraphReader.idWithSeq` gives the reverse lookup; verify `src/core/data/patch/explicit-seq.test.ts` cases titled "explicit insertion sequences are bounded and unique"
- [x] 1.4 Record copies: validation returns records with only known fields and copied values, payload by reference, title, status, label and overrides type-checked (D12); verify `src/core/data/model/record-copies.test.ts` cases titled "stored records are the model's own copies"
- [x] 1.5 World range: node position, node size and route constraint coordinates validated against the world range, constants moved to the data layer, `out-of-range` added to the snapshot error codes (D4); verify `src/core/data/model/world-range.test.ts` and `src/core/io/snapshot/world-range.test.ts` cases titled "records stay inside the supported world range"
- [x] 1.6 Route-constraint limit: 256 in record validation, `maxRouteConstraints` in snapshot limits checked before reading entries (D5); verify `src/core/io/snapshot/route-limit.test.ts` cases titled "route constraints are bounded"

## 2. IDs (core/base, core/edit/adapter, core/io)

- [ ] 2.1 Counter bounds: `observe` ignores counters above 2^50, `next` throws on an unsafe counter or on passing the largest safe integer, snapshot and patch cursors reject unsafe integers, a `__proto__` snapshot cursor key is an error (D6, D16); verify `src/core/base/ids/id-generator.test.ts` and `src/core/io/snapshot/load.test.ts` cases titled "ID counters never wrap or reset" and "ID cursor keys are checked, not dropped"
- [ ] 2.2 Cursor merging: optional `IdGenerator.merge`, text values replace (D7); verify `src/core/edit/adapter/local-adapter.test.ts` case titled "ID cursors merge forward for numbers and text"

## 3. Editing rules (core/edit, facade)

- [ ] 3.1 Capabilities before the patch: `ValidationContext.before`, the capability validator resolves against pre-patch records (D1); verify `src/core/edit/capabilities/capability-validator.test.ts` cases titled "capabilities are judged before the patch"
- [ ] 3.2 Planning sees `addValidator` validators: the command environment reads the adapter's live list; verify `src/core/edit/commands/graph-model-commands.test.ts` case titled "planning sees every registered validator"
- [ ] 3.3 Reserved IDs for queued plans: planning cursor in the local adapter (D8); verify `src/core/edit/adapter/local-adapter.test.ts` case titled "commands issued from inside a handler get distinct IDs"
- [ ] 3.4 Event order and commit hook: a queued job's events go before the next job, verdict cache cleared in `onCommit` (D9); verify `src/core/edit/events/event-hub.test.ts`, `src/core/edit/adapter/local-adapter.test.ts` and `src/core/model-verdicts.test.ts` cases titled "a queued edit's events precede the next queued edit" and "host verdicts are cleared right after commit"
- [ ] 3.5 Queued undo and redo operation IDs; verify `src/core/edit/adapter/local-adapter.test.ts` case titled "queued undo and redo report their own operation ID"
- [ ] 3.6 Rejected undo or redo drops its stack with a reason (D2); verify `src/core/edit/history/local-history.test.ts` and `src/core/edit/adapter/local-adapter.test.ts` cases titled "a rejected undo or redo does not block history"
- [ ] 3.7 History limit option (D3); verify `src/core/edit/history/local-history.test.ts` case titled "local history size limit"
- [ ] 3.8 Checked `replaceDocument`, refused during dispatch (D10); verify `src/core/edit/adapter/local-adapter.test.ts` cases titled "whole-document replacement is checked before it changes anything"
- [ ] 3.9 Moving nodes walks only the moved nodes' connections; verify `src/core/edit/commands/transform-nodes.test.ts` case titled "moving nodes looks only at their own connections"

## 4. Space (core/space)

- [ ] 4.1 Finite scene entries and an index that refuses non-finite boxes (D4); verify `src/core/space/scene/geometry-scene.test.ts` and `src/core/space/spatial-index/aabb-tree.test.ts` cases titled "non-finite bounds never reach the spatial index"
- [ ] 4.2 Fat boxes shrink (D19); verify `src/core/space/spatial-index/aabb-tree.test.ts` case titled "enlarged index boxes shrink with their entries"
- [ ] 4.3 Linear pinned routing (D5); verify `src/core/space/routing/orthogonal-pins.test.ts` case titled "pinned orthogonal routing is linear"
- [ ] 4.4 Geometry content dependencies (D15); verify `src/core/space/scene/geometry-scene.test.ts` case titled "geometry may declare content dependencies"

## 5. I/O (core/io)

- [ ] 5.1 `diffSnapshot` codecs and strict `jsonEqual` (D14); verify `src/core/io/snapshot/diff.test.ts` and `src/core/io/snapshot/json-value.test.ts` cases titled "snapshot diff honours payload codecs"
- [ ] 5.2 Bounded error lists (D13); verify `src/core/io/snapshot/validate.test.ts` case titled "error lists are bounded"
- [ ] 5.3 Strict document extras (D16); verify `src/core/io/snapshot/document.test.ts` case titled "document extras are validated as strictly as the graph"
- [ ] 5.4 Load paths never throw (D17); verify `src/core/io/snapshot/document.test.ts` and `src/core/io/snapshot/validate.test.ts` cases titled "loading never throws"
- [ ] 5.5 Fragment external entries and paste at extreme positions (D18); verify `src/core/io/fragment/fragment-text.test.ts` and `src/core/io/fragment/plan-paste.test.ts` cases titled "fragment external entries have exactly one inside end"

## 6. Docs and gates

- [ ] 6.1 Update `docs/guide-core-model.md`, `docs/guide-using-the-model.md`, `docs/geometry.md` and `docs/format.md` where this change alters what they describe; verify `npm run lint`
- [ ] 6.2 Run `npm run lint`, `npm run typecheck`, `npm test`, `npm run test:browser`, `npm run build` and `openspec validate harden-core-inputs-and-integrity --strict`; record the results in `notes.md`
