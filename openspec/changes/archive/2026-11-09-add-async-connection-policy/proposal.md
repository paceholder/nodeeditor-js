# Proposal

## Why

The connection policy contract is synchronous. It can answer `pending`, and the
planner, `execute` and commit revalidation already carry that outcome (`unverified` /
`pending-validation`), but nothing ever resolves it: a host whose validity rules live
behind a slow service cannot get from "checking" to accepted or rejected. The same gap
blocks docking (a candidate must be judged by the policy while a node is dragged) and the
reconnect tool (a drop target must be judged the same way). This change makes `pending`
resolvable, keeps the policy itself synchronous and deterministic, and gives the connect
tool a defined pending state.

## What Changes

- **Host validator and verdict cache (core/edit).** A host registers a validator, a plain
  function that answers a validation request asynchronously. A policy wrapper returns
  `pending` for a proposal whose verdict is not yet known and `accept` or `reject` once it
  is. Verdicts are stored in a cache keyed by the normalized connection plan, so repeated
  proposals (the same two ports during one drag, a reconnect, a stored connection checked at
  commit) cost no round trip. Evaluating never starts a request; tools and an explicit
  `verifyConnections` call do. A verdict goes stale only when a change touches the
  proposal's ports or their nodes, and a stale verdict never approves a different or
  superseded candidate. The graph model owns the cache and the view reads it
  through a mount option, so every view on one model shares it.
- **Pending resolution in the connect tool (view/interact).** While the target port is
  pending the target shows the pending state. A release on a pending target keeps
  the preview at the release point and commits nothing until the verdict arrives; an
  accepted verdict submits one connect command, a rejected one commits nothing and reports
  the reason. A new press outside overlay content, Escape or locking the view cancels the
  wait.
- **Rejections reach the host as a view event.** A structured rejection from a verdict or
  from commit revalidation is emitted as the `connection-rejected` view event, in addition
  to the existing per-target reason in the preview.
- **One rule for gestures whose entities change.** Tools may declare the entities a gesture
  involves; the router cancels the gesture when one is removed, or changed by an external
  change, and the view emits `gesture-cancelled`. Other changes refer to this rule.
- **Commit path.** Commit revalidation stays synchronous and uses the verdict cache; a
  pending or missing verdict at commit is rejected with the existing `pending-validation`
  reason, never accepted. Undo and redo are the exception: they restore an earlier accepted
  state and are not rejected for a missing verdict. `can` reports a plan that awaits a
  verdict as unavailable for now, and a programmatic connect, paste or duplicate that lacks
  verdicts returns `unverified` together with the proposals it lacks.

Requirements refined: the structured policy outcomes rule, the commit-time revalidation rule, the distinct target states rule and the validation identity rule (a late result is stored under its
own key instead of being discarded), the one committed edit per gesture rule.
New requirements: the host validator and verdict cache rule (host validator and verdict cache), the rejection delivery to the host rule (rejection delivery),
the pending target resolution rule (pending target resolution), the rule that gestures react to changes of the entities they involve (gestures react to changes of their entities).

## Out of Scope

- Docking and reconnect behavior while pending: those changes (`add-docking`,
  `add-reconnect-tool`) call into the mechanism defined here.
- The external model adapter, optimistic pending layer and synchronization modes:
  this is validation of a proposal before it is submitted, not
  the adapter's later accept or reject of a submission.
- Domain rules themselves: the host supplies them as a validator or policy.
- Retry, backoff and transport of the host's request. The library only calls the validator
  and applies a timeout only when the host configures one (there is no default).
- Ordering of host revisions: the cache needs none (freshness comes from change events).
- Async validation of non-connection edits.

## Dependencies

- **Needs the view lock** (from `add-react-integration`): the wait is cancelled when
  the view locks. Archive `add-react-integration` first so that requirement is in the main
  specs.
- **Is needed by** `add-reconnect-tool`, `add-docking` and `add-snapshot-sync-adapter`, which
  use the verdict cache, the `involved` hook, the cancellation rule and the
  `connection-rejected` and `gesture-cancelled` events defined here. Apply and archive in this
  order: this change, then `add-reconnect-tool`, `add-docking`, then
  `add-snapshot-sync-adapter`. This change ships and is verified with the connect tool alone.
