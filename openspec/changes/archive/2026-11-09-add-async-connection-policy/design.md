# Design

## Context

- `ConnectionPolicy.evaluate(proposal, graph)` is synchronous and already returns
  `{ kind: "pending", reason }` (`core/edit/policy/types.ts`). The connect planner maps it
  to `PlanResult.pending` (`edit/commands/connect.ts`), `execute` maps it to
  `status: "unverified"` (`edit/commands/api.ts`), and the commit validator rejects it with
  `pending-validation` (`policy/validator.ts`). Nothing produces or resolves it.
- Commit revalidation (`policy/validator.ts`) rebuilds the proposal of a stored connection
  as `{ from, to, kind }`, without a named choice or a replaced connection, and checks that
  the policy's normalized plan matches the stored orientation. Everything that commits a
  connection goes through it except patches with origin `external`: connect, reconnect,
  paste, duplicate, undo and redo.
- `Revision` is an opaque token "ordered by the adapter that issued it"
  (`core/edit/adapter/types.ts`). Nothing in core can compare two revisions without that
  adapter.
- Tools already handle removal of the entities they use, one tool at a time, through the
  `entities-removed` input (connect, select-move, resize, route-edit). The router keeps
  tool state; a tool cannot tell the router what its state involves.
- The connect tool maps a planner verdict to a presentation state in
  `view/interact/tools/connect-evaluation.ts` (`pending` is a state already) and has a
  `choose` effect with a preview kept at the release point that is the model for a
  pending wait (`view/interact/choice/`).
- `ViewEventMap` (`context-menu`, `hover`, `lock`, `viewport`, `selection`) is how the view
  tells a host that something happened; React hooks subscribe to it. The lock, its `lock`
  event and the cancellation of a gesture on locking come from `add-react-integration`,
  which this change builds on.
- The connect tool asks the tool context for evaluations (`evaluateConnection` in
  `view/interact/tools/tool-context.ts`). That context caches them per `from>to` pair until
  the model revision changes; a verdict arriving changes no revision, so without an explicit
  invalidation a cached `pending` evaluation would stay on screen.
- `createPolicyValidator` already receives the patch origin (`local`, `undo`, `redo`,
  `external`) and skips `external`; the undo and redo exemption below is a new branch on a
  value it already has. `CommandApi.can` today reports any plan that is not `rejected` as
  available, including a pending one, and `ExecuteResult.unverified` carries only a reason
  string.
- Core is headless and deterministic; a promise-returning policy would leak time
  into planning, `dryRun` and commit validation.

## Goals / Non-Goals

**Goals:** a resolvable `pending`; one round trip per proposal; a stale result never
approves another candidate; evaluation (`can`, availability, undo) never causes a network
call; a connect tool that waits without blocking input; rejection reasons reaching the host
as a view event; one mechanism for ending a gesture when something it uses changes.

**Non-Goals:** the external adapter's accept or reject of a submission, docking and reconnect
UX, domain rules, retry policy, ordering of host revisions.

## Decisions

### D1. The policy stays synchronous; time lives in a verdict cache
Alternatives: make `evaluate` return `PolicyOutcome | Promise<PolicyOutcome>` (rejected:
every planner, `dryRun`, history validation and undo would become asynchronous). Instead
`createValidatedPolicy(base, cache)` (core/edit/policy) wraps a base policy. It asks the
base policy first. If the base answers `accept` with a plan, it looks the plan up in the
cache: a current `valid` verdict returns the base outcome; a current `invalid` verdict
returns `reject` with the verdict's `Rejection`; anything else (no entry, request in flight,
entry stale) returns `pending`. **`evaluate` only reads the cache and never starts a
request**, so `can`, availability checks that React hooks re-run on every change, dry runs
and undo never reach the network. The base policy keeps owning cheap structural rules
(direction, capacity) and the host validator only sees structurally acceptable proposals.

### D2. The key is the normalized plan; freshness comes from change events
`verdictKey(plan)` joins the plan's two port IDs in the orientation the base policy chose
and the plan's connection kind, with a separator IDs cannot contain. The named choice and
the replaced connection of the original proposal are deliberately not part of the key: they
only select which plan the base policy produces, and a different alternative is a different
plan and so a different key. Commit revalidation of a stored connection normalizes through
the same base policy and therefore computes the same key, so a reconnect, a named-choice
connect and an input-to-output drawn connection all find the verdict the gesture obtained.

The request sent to the host describes exactly the thing the key names: the normalized
proposal `{ from, to, kind }`. Every entry also records the ports and nodes it concerns (the
two ports and their two nodes). A model `change` that touches any of them marks the entry
stale; a change elsewhere, such as moving an unrelated node, leaves it alone. A verdict that
arrives for an entry marked stale after its request started is discarded. This needs no
comparison of revisions: freshness is decided by events, so the cache works with any
adapter. The request still carries the current revision as an opaque token for the host's
own bookkeeping. Verdicts are never serialized (they are not document data), the cache is
bounded (LRU, default 256), and a `reset` clears it.

### D3. Validator contract, timeout and a single retry
`ConnectionValidator = (request: { proposal; revision; signal }) => Promise<ConnectionVerdict>`
with `ConnectionVerdict = { valid: true } | { valid: false; reason: Rejection }`. It is a
plain function, like `ConnectionChooser`. The library, not the host, tags the settled
verdict with its entry, so a host cannot approve a different candidate by mistake.

The cache owns one `AbortController` per in-flight entry. Leaving a candidate does not abort
it (the answer may be reused); disposing the cache or an explicit cancel by a tool does.
Failure and timeout are stored as rejections with codes `validator-failed` and
`validator-timeout`. The timeout is the option `timeoutMs`; the library has no default, so a
host that wants one sets it, and a timeout reaches the user as a rejection with a reason,
never as an endless pending state.

A verdict discarded as stale does not settle the entry. `request(plan, { wanted })` takes a
predicate that the calling tool supplies ("is this still the candidate on screen or the one
being waited for?"); when a verdict is discarded the cache asks `wanted()` and, if it is
true, makes exactly one new request. A second discard for the same call settles the entry as a
rejection with code `validator-stale`. If `wanted()` is false, the entry is dropped and
nothing is stored. So the re-request is decided by the tool, a proposal never stays pending
for ever, and a chatty model cannot start a request loop.

A reply that is not of the shape `{ valid: true }` or `{ valid: false, reason }` (for example
a missing `valid` field or a reason that is not a rejection) is treated like a failure:
the entry settles as a rejection with code `validator-failed`.

Failures are not permanent. A `validator-failed` or `validator-timeout` entry keeps showing
its rejection while the gesture that asked for it runs; the mount layer clears failed
entries when that gesture ends or is cancelled, and `request` on a failed entry always starts
a new call. So one transient error blocks a port pair only until the user tries again.

### D4. Requests are explicit
`cache.request(plan)` starts a request, or joins the one in flight for the same key, and
returns the verdict promise. Callers: the connect, reconnect and docking tools, through a
`request-verdict` tool effect that the mount layer executes (tool state machines stay pure,
D6), and hosts and tests that call `verifyConnections(proposals)` to settle a batch before
a programmatic edit. Because `request` is the only way to start a validator call, "50
evaluations, one call" holds by construction.

### D4a. Who owns the cache
The graph model owns it. `createGraphModel({ connectionValidator, timeoutMs })` creates the
cache, wraps the connection policy with `createValidatedPolicy` and exposes the cache as
`model.verdicts` (request, subscribe, forget failures). A model built without a validator has
no cache and behaves exactly as today. `mountView` reads it through the option `verdicts`,
which defaults to `model.verdicts` when the model has one; a host with an external adapter
passes its own. Several views on one model share the cache: a request is shared by key, and
each request records who asked, so disposing a view aborts a request only when no other view
still wants it. A `reset` of the model aborts every request in flight, clears the entries, and
ignores answers that arrive later. Disposing the model disposes the cache.

### D5. Edits that arrive without a verdict
- **Programmatic connect.** A command whose plan has no current verdict gets the existing
  `unverified` result with no connection created. A host that wants it to succeed calls
  `verifyConnections` first.
- **Reconnect and named-choice connect** are no different from connect: the key is the plan.
- **Undo and redo** restore a state that was accepted when it was first made, so a missing
  or pending verdict never rejects them. A cached invalid verdict still does. Commit
  revalidation already receives the patch origin; it exempts `undo` and `redo` from the
  missing-verdict rule only.
- **Paste and duplicate** that create connections are planned like connect: every connection
  of the fragment needs a current verdict, otherwise the command returns `unverified`
  listing the proposals it lacks, and nothing is pasted. The clipboard command does not
  retry by itself; a host verifies the fragment's connections with `verifyConnections` and
  repeats the command.
- **`can` and availability** answer "unavailable for now" with reason `pending-validation`
  and never request. This changes `CommandApi.can`, which reports a pending plan as
  available today.
- **The `unverified` result** gains the proposals it lacks, `missing`, so a host knows what to
  pass to `verifyConnections`.

### D6. Cache notifies, tools re-evaluate
The cache exposes `subscribe(listener)` fired when a verdict settles. The view binds it to a
model-binding invalidate and to the tool context, which drops its cached evaluations when
the cache notifies, so a pending target re-evaluates on the next frame without pointer
movement even though no model revision changed. Tool state machines stay pure: a verdict arrival is a new `ToolInput` (`verdict`)
delivered by the router, like the choice answer, and "start a request" is a `request-verdict`
effect.

### D7. Connect tool: wait state
`ConnectState` gains `{ kind: "awaiting", source, target, releasePoint }`. Release on a
target whose evaluation is `pending` enters it and emits a `validate-wait` effect; a
`verdict` input commits (accepted: one `connect`, re-planned at commit) or ends (rejected).
A pointer press elsewhere cancels first and then is handled as in idle (the settled "second
gesture cancels the first" rule). The wait ends through the same cancellation set as any
gesture, including the entity rule of D9 and the lock rule of D10.

### D8. Host notifications are view events
The view emits `"connection-rejected"` with `{ rejection, source }` where `source` is
`"gesture"` (a verdict, policy answer or commit refusal during a pointer gesture) or
`"command"` (the `execute` result of a view command). It is an entry of `ViewEventMap`, next
to `context-menu`, `hover` and `lock`, so `view.on("connection-rejected", …)` and a React hook
use it like the others. There is no callback option on the mount options. `add-docking` and
`add-reconnect-tool` use the same event.

### D9. One mechanism for "an entity the gesture involves changed"
`Tool<S>` gains an optional `involved?(state: S): readonly string[]`: the IDs of nodes, ports
and connections the gesture in that state reads or will write; omitted for pan and marquee.
The router, which holds the state, asks the active tool after every model `change` and on
`reset`. It cancels the gesture when
- an involved entity was **removed**, from any origin (this replaces the per-tool
  `entities-removed` handling, which becomes redundant and is deleted), or
- an involved entity was **changed** by a change with origin `external`.

A change made by the gesture's own commit never cancels it: by then the state is idle.
`CancelReason` gains `"external-change"` and `"entity-removed"`, and the view emits
`"gesture-cancelled"` with `{ reason, ids }` so a host can tell the user. This single rule
serves the connect wait, reconnect, docking and the host-authority adapter; their specs
refer to it instead of restating it.

### D10. Lock during a wait
Locking the view already ends a gesture in progress. A waiting connect gesture is one: the
lock cancels the wait, aborts the request and publishes `gesture-cancelled` with reason
`"locked"` (the lock currently reuses `"escape"`; it gets its own reason). A verdict
arriving afterwards finds no waiting gesture and has no effect, so nothing is dropped
silently after being accepted.

## Risks / Trade-offs

- A verdict can be valid at request time and stale at commit: commit-time revalidation still
  runs, and the host adapter remains the authority.
- Cache memory: entries are bounded (LRU, default 256) and cleared on `reset`.
- The wait state is one more tool state; mitigated by reusing the cancellation set of pending choice resolution.
- Removing the per-tool `entities-removed` handling touches four tools; their existing tests
  keep passing and are the safety net.
