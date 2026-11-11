# Design

## Context

The package has not been released and has no consumers, and the owner approved breaking
changes, so the names can be settled once instead of being kept for compatibility. The
owner decided that a refusal has one field name; the rest of this design is the agent's
choice and is open to review.

Inventory before the change (fields that carry a structured `Rejection`, or the failure
value of a result):

| Where                                         | Field       |
| --------------------------------------------- | ----------- |
| `Result` failure (also snapshot and document results, a list) | `error` |
| `Rejected` submit outcome                     | `error`     |
| `PlanResult` of kind `rejected`               | `error`     |
| `Availability` (`can`), view command availability | `reason` |
| `PolicyOutcome` of kind `reject`              | `reason`    |
| `ConnectionVerdict` with `valid: false`, `VerdictLookup` | `reason` |
| React `useCommand` state                      | `reason`    |
| Model `failure` event, view `connection-rejected` event, tool `reject` effect, context menu refusal | `rejection` |
| `SvgScreen` failure (view)                    | `error`     |

Other fields named `reason` hold plain text or an enumerated cause, not a refusal:
`UnknownOutcome.reason`, the `pending` plan and `unverified` execute results,
`HistoryState.undoReason`/`redoReason`, `ExcludedReference.reason`,
`gesture-cancelled` events. Fields named `error` elsewhere hold a value thrown by host
code (`failure` events from a throwing handler, `onHandlerError`, `onError` callbacks).

## Decisions

### D1. The refusal field is `rejection`, everywhere, including `Result`

Every field that carries a refusal is named `rejection`, and so is the failure side of the
generic `Result`: `{ ok: true, value } | { ok: false, rejection }`. This is the shape the
project's settled decisions already wrote down, the type is already called `Rejection`,
and the events already used the name.

Rejected alternatives:

- `error`: reads as an exception, and the project keeps exceptions for programmer misuse
  only; using it for an expected refusal blurs exactly the line the library draws.
- `reason`: already used for plain-text explanations (`UnknownOutcome`, pending
  validation, `undoReason`), so it would mean two different things.
- Keeping `Result.error` as a separate generic concept: every `Result` the library returns
  reports a refusal of an input or an edit; the snapshot and document results carry a list
  of `SnapshotError`, which is a `Rejection` plus a JSON path. There is no failure kind
  that is not a refusal, so a second name would buy nothing and readers would have to know
  which API returns which.
- `rejections` for the list results: a generic `Result<T, E>` has one field; the type `E`
  says whether it is one rejection or a list.

The boundary of the three words, stated in the docs:

- `rejection`: a refusal the library reports (a `Rejection`, or a list of them).
- `reason`: a plain-text explanation, or an enumerated cause, of a state that is not a
  refusal.
- `error`: a value thrown by host code and caught by the library.

`err(value)` keeps its name (it builds the failure side); its parameter is renamed.
`SvgScreen` follows the same shape (`rejection: SvgViolation`).

### D2. `Revision` is a non-negative integer

`Revision` becomes `type Revision = number`, and the reader, graph state, accepted outcomes,
change and reset events, validator requests and `loadSnapshot`'s report all use it.
`toRevision` is removed.

Why a number and not the opaque text token:

- The reader and graph state already count with a number, and the model token was only
  that number with an `r` in front; two forms of one counter is the defect.
- A number needs no constructor or cast, compares with `===`, and orders without help.
- The opaque token was meant for host revisions in a revisioned mode. That mode is not
  built, and the snapshot adapter plan already separates the library's revision (a local
  counter of displayed changes) from a host's own token, which the host compares with its
  own comparison. A host token therefore never has to fit in `Revision`.

Rejected: an opaque branded string everywhere (the reader would need a constructor too,
every test and host would need casts, and ordering would need the adapter); a branded
number (a constructor for an integer buys little and reintroduces the cast the audit
complained about).

### D3. The local adapter checks `baseRevision`

The semantics are clear for a synchronous authority: an edit is planned against the state
at its base revision, so a base revision other than the current one means the plan may no
longer fit. The local adapter rejects such a submission with the new code
`stale-revision`, changes nothing, records no history and emits the usual `failure` event.

- The check happens when `submit` is called, not when a queued submission (one made inside
  an event handler) later runs: queued edits from one handler are planned together against
  the revision they saw, and the ones queued before them advance the revision on purpose.
- Undo and redo build their own submissions at the current revision, so they never fail
  the check.
- `GraphModel.submit` still defaults `baseRevision` to the current revision, so callers who
  do not pass it are unaffected.

Rejected: removing `baseRevision` from the submit options. External adapters need it on
the submission, and offering it to callers who hold a plan while the model may change (a
deferred confirmation dialog, for example) is useful once it is checked.

### D4. `operationId(text)` is exported, validated like the entity IDs

`OperationId` moves next to the entity ID brands, and the core entry exports
`operationId(text)`, which throws `MisuseError` for a malformed ID (empty or containing
whitespace), the same rule as `nodeId`. The cast helper `toOperationId` is removed. With D2
`baseRevision` is a number and needs no constructor.

Rejected: accepting plain strings in `SubmitOptions`. The branded type keeps an operation
ID from being passed where an entity ID is expected, and the constructor is one call.

### D5. `label` mount option and `NodeEditor` prop

`ViewOptions.label` sets the root's `aria-label`; without it the name is "Node editor",
as before. A runtime setter `view.setLabel(label?)` renames the mounted root, and without
an argument restores the default; it keeps the default text inside the view instead of
exporting a constant. The React prop is `live` and uses that setter: a change renames the
mounted view without a remount, and dropping the prop restores the default. Writing the
attribute on `view.element` keeps working for hosts that prefer it.

### D6. Public surface review lists candidates; removals are rare

The review covers the core entry. A name is removed only when nothing outside its own
module (no example, doc, benchmark or test elsewhere, and no other entry) uses it through
the entry. Everything else is listed as a candidate in `notes.md` for a later decision.
The one-entry-point-per-name rule is unchanged.

## Risks

- A large rename across layers: it is done in one commit so every commit compiles, and the
  type checker finds every typed use. Untyped object literals in test expectations are
  found by the test run.
- Other planned changes (snapshot adapter, host integration checks) were written with the
  old names; their task lists are not rewritten here, but their authors will hit compile
  errors that point at the new names.
