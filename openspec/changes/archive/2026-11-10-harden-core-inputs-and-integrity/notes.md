# Implementation notes

Findings of the audit sections "Core data and editing" and "Core space and I/O", and what
happened to each. The audit's repro scripts were not kept; each scenario was re-derived as a
throwaway test before the fix, then turned into the regression test the task names.

## Reproduction before the fixes

Re-derived on the commit this change started from:

- Orphaned port: an update of `a.ports` from `[p1, p2]` to `[p1]` was accepted and `p2` stayed.
- Capability scenarios A and B: both patches accepted.
- `__proto__` update field: accepted; the stored node read `title` "x" but had no own `title`.
- Two creates from one change handler: settled accepted and rejected with `duplicate-id`.
- Text cursor without `observe`: two creates accepted, then every create `duplicate-id`.
- Host validator added with `addValidator`: `can` available, `plan` ready, `execute` rejected.
- Stuck undo: scenario A rejected with `conflict` and `canUndo` stayed true; scenario B
  rejected with `capability-denied` and `canUndo` stayed true.
- Event order: two submits queued from one handler; B's change event was delivered after C had
  already committed. The stale-verdict consequence, read only in the audit, also reproduced:
  a queued edit that made a cached verdict stale was followed by a queued connect that the
  stale verdict still approved (`src/core/queued-verdicts.test.ts` failed with `accepted`).
- `replaceDocument` with a node listing a missing port: threw after the batch; revision went
  from r1 to r2, the store held the new node, the undo history was kept, no reset event.
- Explicit `seq`: a duplicate of a live sequence was accepted; a sequence of 2^53 - 1 made the
  next two automatic sequences equal (2^53).
- Record references: with `freezeRecords: false` a later mutation of the caller's object
  changed the stored title; an extra key was stored; with freezing on, the caller's object was
  frozen.
- Queued undo: the queued result reported `op3`, the commit used `op4`.
- One node at x = -1.7e308, width 1.7e308: loaded; a rectangle query and a pick then found
  nothing.
- Pinned routing: 4000 pins of one orientation took 23 ms per route (alternating orientations
  2.6 ms), the quadratic `nextFixed` search.
- ID counter: after loading `n9007199254740991` the creates minted `n9007199254740992` and then
  `n1`; a cursor of `1e300` was reset to the highest live ID (`n5`), so the next create was `n6`.
- `diffSnapshot` against a model loaded with a date codec: one payload update; `jsonEqual`
  called two different dates, and a `Map` and `{}`, equal.
- Errors: 100,000 junk nodes produced 700,000 errors in 1.2 s.
- Fragment `external` entry with both ends inside: accepted by the parser. With the default
  policy the paste did not duplicate the connection only because parallel connections are
  refused; a policy that allows them would.
- Document extras: duplicate selection kept, an unknown viewport key dropped, zoom 1e-300
  accepted.
- ID-cursor key `__proto__`: dropped silently.
- A throwing migration and a throwing `nodes` getter both threw out of the loader.

## Findings not reproduced as described

- **Paste plan ready with NaN positions.** `plan` dry-runs the patch, and record validation
  rejects a NaN position, so a NaN offset already returned `rejected` with `non-finite`. What
  did reproduce is a fragment at finite extreme positions (1e308) that planned `ready`; the
  world-range check (task 1.5) now rejects it, as the audit expected.

## Deferred

- **Picking allocates per candidate** (`polyline.ts` `parts`). Connection paths are already
  split into at most 12 indexed pieces, so a pick measures exact distance only on the few
  pieces near the pointer, each holding a handful of parts. Caching parts per piece needs
  either a module-level memo (against the no-module-singleton convention) or a new field on
  the scene's connection entry that every router's output would carry; neither pays for itself
  without a measured cost. Left for a performance change with a benchmark.

## Outcome per finding

Core data and editing:

| Finding | Outcome | Task |
| --- | --- | --- |
| Node `ports` update leaves a port without an owner | fixed (patch check and store check) | 1.1 |
| Capability locks bypassed (both scenarios) | fixed, judged before the patch | 3.1 |
| `__proto__` accepted as an update field, other own-key checks | fixed | 1.2, 2.1 |
| Commands from inside an event handler get the same IDs | fixed, reserved planning cursor | 3.3 |
| Text values in a custom ID cursor never advance | fixed, optional `merge` | 2.2 |
| Planning ignores `addValidator` validators | fixed | 3.2 |
| A rejected undo blocks the stack permanently | fixed, stack dropped with a reason | 3.6 |
| Events from queued submissions arrive after later commits; verdict cache cleared late | fixed, both | 3.4 |
| A failed `replaceDocument` leaves a half-loaded document; not queued in handlers | fixed: checked first, refused in handlers | 3.8 |
| Explicit `seq` not checked | fixed | 1.3 |
| Records stored by reference, unknown keys stored | fixed (payload still by reference, D12) | 1.4 |
| Queued undo or redo reports another operation ID | fixed | 3.5 |
| Undo history grows without limit | option added, default unlimited (D3) | 3.7 |
| Moving nodes scans every connection | fixed | 3.9 |

Core space and I/O:

| Finding | Outcome | Task |
| --- | --- | --- |
| One node with extreme coordinates blanks the canvas | fixed: world range in records, finite scene entries, index refuses non-finite boxes | 1.5, 4.1 |
| Route pins unbounded, pinned routing quadratic | fixed: 256 limit, linear walk | 1.6, 4.3 |
| ID counter overflow blocks creation or reuses IDs | fixed | 2.1 |
| `diffSnapshot` ignores codecs, `jsonEqual` calls non-plain objects equal | fixed | 5.1 |
| Error collection unbounded | fixed, 100 plus an omitted entry | 5.2 |
| Scene stale for host geometries | fixed, `NodeGeometry.dependsOn` | 4.4 |
| Fragment `external` entries not checked | fixed | 5.5 |
| Paste plan ready with NaN positions | not reproduced as described (see above); extreme finite positions fixed by the world range | 1.5, 5.5 |
| Document extras laxer than the format | fixed | 5.3 |
| ID-cursor key `__proto__` dropped | fixed, reported at its path | 2.1 |
| Two paths throw despite the never-throws contract | fixed (migrations, getters, codecs) | 5.4 |
| Fat boxes never shrink | fixed | 4.2 |
| Picking allocates per candidate | deferred (see above) | |
| Self-loops and parallel duplicates load without complaint | documented in `docs/format.md` as structural-only | 6.1 |

## Decisions taken while applying

- **The pre-patch graph reaches validators as `ValidationContext.before`.** It is required,
  not optional: `applyPatch` and the command dry run fill it, and nothing else builds a
  context. The host capability policy is asked with the pre-patch graph too.
- **Record validation also type-checks title, status, port label and capability overrides.**
  Copying the known fields needed their shapes; before, a patch could store a title that was
  an object. The snapshot parser already enforced the same.
- **`GraphReader.idWithSeq(kind, seq)` was added** for the explicit-sequence check, backed by
  a sequence-to-ID map in each collection and in the staged overlay. Two scene ordering tests
  that built equal sequences through patches now use a reader that reports one sequence for
  every entity, since a patch can no longer produce that state.
- **The default counter generator throws `MisuseError` for a text or negative counter** under
  its own prefix keys, where it used to treat them as 0.
- **Queued plans reserve IDs until the queue drains.** The planning cursor is dropped once no
  queued submission is left, so a rejected queued patch leaves a gap only while others are
  still waiting; afterwards planning continues from the committed cursor.
- **The commit hook (`LocalAdapter.onCommit`) is internal to the adapter.** It is not on the
  model facade; the facade uses it for the verdict cache. Listeners must not submit.
- **`replaceDocument` stores the checked copies**, so a host loader's records are not shared
  with the store, matching the patch path.
- **Paste needed no planner change** for extreme positions: the world-range check in record
  validation makes the dry run reject them with `out-of-range`.
- **The error bound applies per validation call**: snapshot, fragment (envelope, external
  entries, inner snapshot and payload decoding share one sink), document extras, payload
  decoding on load and payload encoding on save. A document's graph errors carry the
  omitted entry at the path `graph`.
- **`diffSnapshot` now returns a `Result`** whether or not codecs are given, so callers have
  one shape to handle; the existing diff tests unwrap it through a small helper.
- **The linear-routing test compares growth, not absolute time**: ten times the pins must take
  less than 35 times as long (the old walk measured 68 times), best of three runs, so a busy
  machine does not decide it.

## Decisions for the owner to review

- D2: a rejected undo or redo drops its whole stack. A host policy that refuses only for a
  while (for example during a simulation run) therefore costs the user the undo steps below
  the refused one.
- D3: no default history limit (unchanged behaviour). A finite default would bound memory.
- D6 and D16: documents with numeric cursor values that are not safe integers, viewport zooms
  outside 0.001 to 1000, duplicate selection entries or coordinates beyond 1e7 no longer load.
- D10: `replaceDocument` (and `loadSnapshot`) throw `MisuseError` inside an event handler
  instead of queueing.

## Results

Run on the final commit of this change:

- `npm run lint`: passed (biome, 0 errors).
- `npm run typecheck`: passed (whole project, core-only pass without the DOM library, examples).
- `npm test`: 176 files, 1066 tests passed (the change started from 976).
- `npm run test:browser`: 60 files, 321 tests passed in Google Chrome.
- `npm run build`: passed.
- `openspec validate harden-core-inputs-and-integrity --strict`: valid, exit status 0.
- `src/architecture.test.ts`: passed; no wrong-way import, core stays DOM-free.
