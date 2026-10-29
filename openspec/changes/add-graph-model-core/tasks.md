# Tasks

## 1. Results and identifiers

- [ ] 1.1 Add `src/core/base/result.ts` (Result, ok, err, Rejection, RejectionCode with structural codes, MisuseError); verify with `src/core/base/result.test.ts` and `npm run typecheck`
- [ ] 1.2 Add `src/core/base/ids/ids.ts` (branded ID types, IdKind, isWellFormedId); verify `ids.test.ts` "MOD-03 opaque IDs" covers empty, whitespace and non-string rejection
- [ ] 1.3 Add `src/core/base/ids/id-generator.ts` with `createCounterIdGenerator()`; verify `id-generator.test.ts` "MOD-03a" covers prefixed sequences, a pure `next` (no hidden state), and a cursor that is JSON round-trippable
- [ ] 1.4 Add `observe(id, cursor)` to the generator contract and the counter generator (pure, never moves the cursor backwards, ignores IDs with a foreign prefix or non-numeric remainder); verify `id-generator.test.ts` "MOD-03a observe external IDs" shows that observing `n12` at cursor 9 makes the next node ID `n13`, observing `n3` at cursor 9 changes nothing, and the result stays JSON round-trippable
- [ ] 1.5 Verify a host-supplied UUID-style generator works through the same contract; `id-generator.test.ts` "MOD-03a host generator" passes

## 2. Records and structural validation

- [ ] 2.1 Add `src/core/data/model/values.ts` and `src/core/data/model/records.ts` (types from design.md); verify `npm run typecheck` including the core-only pass
- [ ] 2.2 Add `src/core/data/model/validate-records.ts`; verify `validate-records.test.ts` "MOD-09" covers NaN/Infinity positions and sizes, negative limits, malformed IDs, and a port whose `node` disagrees with its owner, each returning the expected code
- [ ] 2.3 Verify that validation never throws on arbitrary input (null, wrong types); `validate-records.test.ts` "MOD-09 never throws" passes

## 3. Store, indexes and ordering

- [ ] 3.1 Add `src/core/data/model/store.ts` (ordered collections with `seq`, `batch()`, revision counter); verify `store.test.ts` "MOD-05 batch consistency" shows indexes are consistent when a batch ends and that reads inside a batch are not exposed to outside readers
- [ ] 3.2 Add `src/core/data/model/indexes.ts`; verify `indexes.test.ts` "MOD-07" covers incident connections per node, attachments per port, and neighbors, with undirected endpoints indexed on both sides
- [ ] 3.3 Verify query cost: `indexes.test.ts` "MOD-07 scale" builds 10k nodes and 20k connections and asserts the port-attachment query touches only that port's entries (instrumented counter)
- [ ] 3.4 Verify deterministic ordering: `store.test.ts` "MOD-08" checks that the same insertion sequence yields identical node, port and connection order across two stores, and that paint order follows `(z, seq)`

## 4. Reader and read snapshots

- [ ] 4.1 Add `src/core/data/model/reader.ts` (GraphReader backed by the store); verify `reader.test.ts` "MOD-01 headless reads" runs in the Node environment
- [ ] 4.2 Add `src/core/data/model/freeze.ts` and `src/core/data/model/state.ts` (lazy, cached per revision); verify `state.test.ts` "MOD-13": writing to a returned record throws when freezing is on, a kept state still shows old values after a later batch, and the state is reused while the revision is unchanged
- [ ] 4.3 Verify `freezeRecords: false` returns unfrozen records; `state.test.ts` "MOD-13 production opt-out" passes
- [ ] 4.4 Verify that application-invalid but structurally valid data stays readable; `reader.test.ts` "MOD-09a" stores an over-limit attachment and reads it back unchanged
- [ ] 4.5 Add `seqOf(id)` to `GraphReader` for nodes, ports and connections; verify `reader.test.ts` "MOD-08 seqOf" shows `seqOf` is strictly increasing in insertion order, returns `undefined` for unknown IDs, and a remove then restore with the same `seq` (undo path) reads back the original value

## 5. Exports and documentation

- [ ] 5.1 Export the public types, the generator and `GraphReader` from `src/core/index.ts` (the store stays internal); verify `src/core/index.test.ts` imports them in Node and `npm run build` emits declarations
- [ ] 5.2 Document the ID, ordering and snapshot-lifetime rules in TSDoc on the exported types; verify `npm run lint` and `npm run typecheck` pass
- [ ] 5.3 Run `npm test`, `npm run typecheck` and `npm run lint`; all pass
