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
  already committed (ordering only; the stale-verdict consequence follows from it).
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

## Decisions taken while applying

(Filled in as tasks land.)
