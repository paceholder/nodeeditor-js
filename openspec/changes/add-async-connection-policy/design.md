# Design

## Context

- `ConnectionPolicy.evaluate(proposal, graph)` is synchronous and already returns
  `{ kind: "pending", reason }` (`core/edit/policy/types.ts`). The connect planner maps it
  to `PlanResult.pending` (`edit/commands/connect.ts`), `execute` maps it to
  `status: "unverified"` (`edit/commands/api.ts`), and the commit validator rejects it with
  `pending-validation` (`policy/validator.ts`). Nothing produces or resolves it.
- The connect tool maps a planner verdict to a presentation state in
  `view/interact/tools/connect-evaluation.ts` (`pending` is a state already) and has a
  `choose` effect with a preview kept at the release point (INT-12a) that is the model for a
  pending wait (`view/interact/choice/`).
- Core is headless and deterministic (MOD-08); a promise-returning policy would leak time
  into planning, `dryRun` and commit validation.

## Goals / Non-Goals

**Goals:** a resolvable `pending`; one round trip per proposal; stale results never approve
another candidate; a connect tool that waits without blocking input; rejection reasons
reaching the host.

**Non-Goals:** the external adapter's accept or reject of a submission, docking and reconnect
UX, domain rules, retry policy.

## Decisions

### D1. The policy stays synchronous; time lives in a verdict cache
Alternatives: make `evaluate` return `PolicyOutcome | Promise<PolicyOutcome>` (rejected:
every planner, `dryRun`, history validation and undo would become asynchronous). Instead a
`createValidatedPolicy(base, validator, options)` wrapper (core/edit/policy) first asks the
base policy; if the base answers `accept` it consults the verdict cache for the proposal
signature. Cache hit `valid` returns the base outcome; `invalid` returns `reject` with the
verdict's `Rejection`; a miss returns `pending` and starts one validator call. The base
policy therefore keeps owning cheap structural rules (direction, capacity) and the host
validator only sees structurally acceptable proposals.

### D2. Signature and revision
`proposalSignature(proposal)` joins the ordered port IDs (undirected pairs sorted so draw
order does not matter, CON-01b), `kind`, `choice` and `replacing`, with a separator that
IDs cannot contain. The request carries the graph revision at request time. A verdict is
current only if its signature matches an in-flight request and its revision is not older
than the cache's current revision floor. The floor advances on any change touching the two
ports or their nodes (listener on model `change`); entries older than the floor are
dropped, so a node move does not invalidate but a port type change does. Verdicts are not
serialized (they are not document data).

### D3. Validator contract and abort
`ConnectionValidator.validate(request, signal): Promise<ConnectionVerdict>` where
`ConnectionVerdict = { valid: true } | { valid: false; reason: Rejection }`. The cache owns
one `AbortController` per in-flight signature; leaving a candidate does not abort it
(the answer may be reused), disposing the cache or an explicit cancel by the tool does.
Failure and timeout (option `timeoutMs`, no default timeout is imposed unless the host sets
one; see Open Questions) are stored as rejections with codes `validator-failed` and
`validator-timeout`.

### D4. Cache notifies, tools re-evaluate
The cache exposes `subscribe(listener)` fired when a verdict settles. The view binds it to
a model-binding invalidate so a pending target re-evaluates on the next frame without
pointer movement. Tool state machines stay pure: a verdict arrival is a new `ToolInput`
(`verdict`) delivered by the router, like the choice answer.

### D5. Connect tool: wait state
`ConnectState` gains `{ kind: "awaiting", source, target, releasePoint }`. Release on a
target whose evaluation is `pending` enters it and emits a `validate-wait` effect; a
`verdict` input commits (accepted: one `connect`, re-planned at commit) or ends (rejected).
A pointer press elsewhere cancels first and then is handled as in idle (this is the
settled "second gesture cancels the first" rule of INT-13). Rejection delivery: a view
option `onRejection(rejection, context)` called by the mount layer from tool effects and
from `execute` results of view commands.

### D6. Commit uses the cache
`revalidate` calls `policy.evaluate` on the wrapped policy, so commit sees `valid` from the
cache or `pending` (`pending-validation`). No new commit path.

## Risks / Trade-offs

- A verdict can be valid at request time and stale at commit: CON-05 revalidation still
  runs, and the host adapter remains the authority.
- Cache memory: entries are bounded (LRU, default 256) and dropped on revision floor
  advance.
- The wait state is one more tool state; mitigated by reusing the INT-12a cancellation set.

## Open Questions

1. Default timeout: none, or a fixed value (for example 10 s)? Proposed: none by default,
   host option.
2. Should the revision floor also advance on any change in the whole graph (simpler,
   fewer reuse hits)? Proposed: only changes touching the proposal's ports and nodes.
