# Notes

## Snapshot push cost (task 3.8), measured

Measured on 2026-11-11 with `bench/headless/snapshot-push.bench.ts` (run alone:
`npx vitest bench --config bench/vitest.bench.config.ts --project "node (bench)" --run bench/headless/snapshot-push.bench.ts`;
`npm run bench` runs it with the other headless benches). Working tree on top of commit
`b3b4604`, source build through the bench aliases.

Machine: Apple M1 Pro, 16 GB, macOS (Darwin 25.6), Node 22.23.4. The laptop was on battery
power during the run (56 %, discharging), which the bench README warns can throttle the
CPU; numbers on mains power may be lower. One run, 50 iterations per case after 3 warm-ups.

Each iteration pushes a whole seeded fixture snapshot (two connections per node) that
differs from the displayed state by one moved node, so every push applies exactly one
update. "One pending edit" keeps an unanswered move of another node, so the push also
rebases it on a scratch copy of the confirmed state.

| Nodes | Pending edits | p50 ms | p95 ms | p99 ms |
| --- | --- | --- | --- | --- |
| 500 | none | 7.83 | 8.82 | 26.07 |
| 500 | one | 10.90 | 11.95 | 12.09 |
| 5000 | none | 86.84 | 104.90 | 112.67 |
| 5000 | one | 121.82 | 146.86 | 153.81 |

Reading: the cost is linear in the document size, as designed (D3): validation, building
the candidate confirmed store and the full diff dominate, and they match the existing
F-LARGE baseline (10 000 nodes: validate 53 ms, diff 40 ms p50) at half the size. A
pending edit adds a store copy and a snapshot export of the rebased target (about 35 ms at
5000 nodes). No target exists for this metric (`pushMs`). At 5000 nodes a push costs
several frames, so a host that pushes at that size should not push more often than its
document changes; the equal-snapshot fast path mentioned under Risks in the design is not
implemented.

## Implementation notes (tasks 3.6 to 3.7b)

- Host-owned history: `onUndo` and `onRedo` receive `{ operationId }` and answer with the
  same `HostAnswer` shape as `onSubmit`, including `timeoutMs`. Their answers come only
  through the returned promise; `settle` applies to pending edits only. A `history` event
  is published after a commit, an answer or a push whenever the host's `historyState`
  value changed (compared structurally), so a view re-reads availability without a
  separate notification call.
- Local history: undo and redo are refused with `edit-pending` while the entry undo would
  revert is unanswered (pending or unknown), and both while an earlier undo or redo is
  unanswered. `HistoryState` gained optional `undoCode` and `redoCode`, so the undo
  command (`can` and `execute`) reports `edit-pending` rather than `history-unavailable`.
  An undo the host rejects is rolled back and its entry returns to the undo stack; an
  undo or redo that becomes conflicted drops its entry.
- Conflict events are published after the change event of the push or rollback that
  caused them, so a handler reads the display without the edit. `entities` lists the IDs
  the edit touches plus the end nodes of its connections, like the filled entities of a
  rejection.
- Unconfirmed flag: the adapter exposes `unconfirmed()` (sets of node, port and
  connection IDs touched directly by displayed edits still awaiting the host; conflicted
  edits are excluded since they are not displayed). It is not on `SnapshotModel` yet;
  passing it into the view state is task 4.3, which decides how the model exposes it.
- Revisioned push: a stale push returns `{ ok: true, status: "ignored", reason: "stale",
  revision }` with the library's revision. Validation runs before the staleness check, so
  an invalid stale push is refused. A refused push does not advance the last host
  revision; a push without one leaves it unchanged; `replaceDocument` (and so
  `loadSnapshot`) forgets it. The default comparison throws `MisuseError` for a token that
  is not a finite number.
- The adapter option for push size limits is `pushLimits` (was `limits`), so it does not
  read as the fragment or node size limits in the model options. `payloadCodecs` of the
  model options also decode pushed snapshots.

## Implementation notes (tasks 3b.1 to 3b.5)

- Plans: a new `delegated` plan outcome (`intent`, `label`, `excluded` for paste and
  duplicate). The command layer gives planners `ctx.delegation` when the adapter's
  `nodeCreation` is `delegated`; the intent's operation ID is minted while planning, so
  `plan` and `can` of a creation under a delegating adapter use up an operation ID each.
  `execute` hands the intent to `adapter.delegate`. Type checks (`unknown-type`,
  `not-creatable`) run first; the type's payload and port factories do not run (the host
  builds the node and its ports), so the intent carries only the command's own payload.
- "The capability policy forbids creation": the capability layer has no creation action
  (`CapabilityPolicy.decide` judges an existing node), so the only model-wide creation
  refusal is read-only mode. `CommandEnvironment.creationRefusal` reports it before any
  delegation, for `can` and `execute` alike; a host that wants per-type refusal marks the
  type `creatable: false`. A creation action for `CapabilityPolicy` would be a new
  decision.
- `Accepted.nodeId`: set on the outcome of a node creation, local (from the plan's
  created node, also on a queued result's `settled`) or delegated (the ID the host named).
- Delegated fragments: fragment-local keys are positional (`node-1`, `port-1`,
  `connection-1`), never the copied entities' IDs, so a duplicate cannot be mistaken for
  its original. Preserved outside connections name the existing port; without the
  connection policy (the host owns it), an outside end that no longer exists is excluded
  as `endpoint-missing`. A fragment node intent carries type, position, title, payload
  and ports (direction, type key, label) as the spec lists; size, rotation, mirroring,
  port limits and placements are not handed over.
- Snapshot adapter options gain `nodeCreation` and `onDelegate` (a union,
  `SnapshotCreationOptions`). `HostAnswer` accepted may carry `nodeId`; an accepted
  create-node answer without one is misuse through `settle` and an unknown outcome through
  the promise; a malformed ID is treated the same way.
- Creation lifecycle (`creation-flow.ts`, `creation-handover.ts`): the creation is
  registered and handed over inside the adapter's dispatch, so `settle` and pushes from
  `onDelegate` are queued. One `timeoutMs` timer runs from the hand-over and covers both
  the answer and the arrival of the named node. An ID is "already claimed" when another
  unsettled creation claimed it or the confirmed state at hand-over held it (the adapter
  keeps a reference to that reader while the creation waits); the refusal is logged and
  also published as a `failure` event. A fragment settles from the host's answer alone
  (its nodes arrive with a later push under IDs the host chose); its placeholders, one
  per fragment node at position plus offset, leave with the answer. Placeholders are
  listed by `placeholders()` on the adapter and the snapshot model.
- View: `executeAndSelect` reports a delegated paste as pending with nothing created (4.4
  shows the refusal); the connect evaluation treats a `delegated` plan as incompatible,
  since a connect never plans one.
- Public surface: core rose by three names (`DelegatedIntent`, `SnapshotCreationOptions`,
  `CreationPlaceholder`), reason written in `scripts/public-surface.test.ts`.
- 3b.5 raised two wording points, both resolved in the spec, design and task: a rolled-back connect
  removes the connection, so a gesture on it is cancelled with `entity-removed` (the router's rule
  for any removed entity); and the host is expected to use the code `duplicate-connection`, since a
  host answer always carries its own code. Verified in `snapshot-conflicts.test.ts`.

## Implementation notes (tasks 4.1 to 4.4)

- 4.1: `src/view/test-support/snapshot-tool-harness.ts` runs the real tools, scene and
  router over a snapshot model on a fake host, seeded from the usual fixture specs, with
  `push(edit)` (the last pushed snapshot, changed) and `answer(index, status)`. Each tool
  with involved entities (select/move, resize, connect, route edit) gained four cases in
  its own test file: push removing an involved entity (`entity-removed`), push changing
  one (`external-change`), rollback after a host rejection of an edit of it
  (`external-change`), and an unrelated push (no cancel, one submission on release). No
  router change was needed. `connect-tool.test.ts` was already over 600 lines; it grew by
  about 75.
- 4.2: `src/view/snapshot-sync.browser.test.ts` passes in Chrome.
- 4.3: `SnapshotModel.unconfirmed()` returns the adapter's `UnconfirmedIds` (core rose by
  that one type name; reason in `scripts/public-surface.test.ts`). `ViewState` gained
  optional `isUnconfirmed(id)` and `placeholders()`; `mountView` fills them from a bound
  model that has `unconfirmed()` and `placeholders()` (`view/platform/pending-state.ts`,
  read once per paint and dropped in a microtask), merged with a host `viewState`. Node
  painters get `state.unconfirmed`, port glyph and connection painters `unconfirmed`.
  Placeholders are not scene entities, so interaction painters receive the composed view
  state as a third `paint` argument and read `placeholders()` there. No built-in painter
  draws either.
  Open point: an acceptance and a new placeholder change nothing in the read model and
  publish no event, so the view does not repaint for them by itself; the view guide tells
  a host that draws them to invalidate when it hands over or answers. A model event for
  "pending state changed" would close this, but it is not in the spec.
- 4.4: a pending paste or duplicate whose deferred result later settles rejected is
  reported by a second clipboard `paste` event, `{ ok: false, rejection }`, carrying the
  authority's rejection unchanged (delegated fragments and ordinary pending pastes alike;
  an unknown outcome adds no report). Verified in
  `src/view/interact/clipboard/delegated-paste.test.ts`.

## Implementation notes (tasks 5.1 and 5.2)

- 5.1: `examples/host-authority/` holds `store.ts` (the host's store: nodes and links in
  its own format, atomic batches, store-named nodes and pins, kept client link IDs, refusal
  of already-linked pins in either order and of an ID in use, a retried link with the same
  ID and pins accepted as the same link, a fake asynchronous transport), `convert.ts`
  (store document to graph snapshot, node type registry), `calls.ts` (decoded intents to
  one store batch per submission, store refusals to library rejections), `host.ts`
  (`createSnapshotModel` with a per-client prefixed generator, `onSubmit`, delegated
  creation, refresh on every store notice with the store version as the push revision)
  and `host-authority.test.ts`. The example imports `@paceholder/nodeeditor-js` like a
  consumer; the node project of `vitest.config.ts` now includes `examples/**/*.test.ts`
  and resolves that name to `src/core/index.ts`, so `npm test` runs it without a build.
  There is no separate script entry: the example runs in Node through its test
  (`npx vitest run examples/host-authority`), since a plain `node` run of TypeScript
  sources with `.js` import specifiers would need a loader the project does not have.
- 5.2: `docs/guide-host-authority.md`; `docs/architecture.md` section 5 (snapshot mode
  implemented, revisioned mode still planned), the status line of section 2 and the code
  map (`edit/intents/`, `io/sync/`, `snapshot-model.ts`); `docs/guide-using-the-model.md`
  links the guide. `AGENTS.md` layer table names `intents`, `io/sync` and
  `src/core/snapshot-model.ts`.

## Gates (task 6.1), measured

Run on 2026-11-11 on the working tree on top of commit `b3b4604` (Apple M1 Pro, macOS,
Node 22.23.4).

| Gate | Result |
| --- | --- |
| `npm run lint` | 1 error, in `openspec/config.yaml` line 79 (single quotes the formatter would make double); an uncommitted edit outside this change, left as is. Every other file passes. |
| `npm run typecheck` | passes (all four projects, examples included) |
| `npm test` | 212 files, 1313 tests passed (includes `examples/host-authority/host-authority.test.ts`, 7 tests, and `scripts/requirement-codes.test.ts`) |
| `npm run test:browser` | 75 files, 367 tests passed in Chrome |
| `npm run build` | passes; the declaration build warns that `core/index.d.ts` references `GraphModelSettings` and `SnapshotAdapterBaseOptions` (through `SnapshotModelOptions`) without a public re-export |
| `npm run bench:size` | below |

| Entry | gzip KiB | Budget KiB | Status |
| --- | --- | --- | --- |
| core | 49.3 | 75.0 | met |
| view | 55.4 | 150.0 | met |
| advanced | 33.6 | - | no target |
| react | 57.3 | - | no target |

Open point: the declaration warning means a consumer that writes a declaration naming
`SnapshotModelOptions` could hit an inferred-type error. Exporting the two type names from
`src/core/index.ts` (and recording the reason in `scripts/public-surface.test.ts`) would
close it; that changes the public surface, so it is left for a decision.

## Review fixes

- A rejection whose display cannot be recomputed (a payload codec fails while the
  rebased target is encoded for the diff) is handled like a push the codec refuses:
  nothing displayed changes and the remaining pending edits keep their states (none is
  marked conflicted, since nothing was rebased on screen). The rejected edit still settles
  rejected with its failure event, and then a `resync-requested` event names its operation
  ID with a reason that quotes the codec errors, since the display still shows the
  refused edit and only a fresh push recomputes it. The failure is also logged. Chosen
  over throwing (the answer may come through the host's promise, where a throw would be an
  unhandled rejection) and over a second `failure` event for an operation that already
  has one. Verified in `snapshot-redisplay.test.ts`.
- A creation whose outcome became unknown after the host had answered (its named node did
  not arrive within `timeoutMs`) is settled again by the host's next answer, as the settle
  table says for an unknown edit: rejected drops the placeholder with a failure event,
  accepted with an ID claims that ID and settles when the node arrives. A second unknown
  answer stays a logged no-op. The deferred result already settled unknown and does not
  settle again, as for an edit. Verified in `snapshot-create-settle.test.ts`.
- A host-named node ID that an unsettled local edit adds (for example an undo that
  restores a deleted node) is refused with `node-id-claimed`, like an ID another creation
  claimed.
- A delegated paste or duplicate that settles accepted no longer clears the selection.
- The view state leaves `isUnconfirmed` and `placeholders` unset for a model that reports
  neither, reads a single source directly, and the adapter returns one shared empty list
  when no creation is pending, so a paint allocates no list.
