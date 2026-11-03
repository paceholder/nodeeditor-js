# Proposal

## Why

The connection policy contract is synchronous. It can answer `pending` (CON-04), and the
planner, `execute` and commit revalidation already carry that outcome (`unverified` /
`pending-validation`), but nothing ever resolves it: a host whose validity rules live
behind a slow service cannot get from "checking" to accepted or rejected. The same gap
blocks docking (a candidate must be judged by the policy while a node is dragged) and the
reconnect tool (a drop target must be judged the same way). This change makes `pending`
resolvable, keeps the policy itself synchronous and deterministic, and gives the connect
tool a defined pending state.

## What Changes

- **Host validator and verdict cache (core/edit).** A host registers a validator that
  answers a validation request asynchronously. A policy wrapper returns `pending` for a
  proposal whose verdict is not yet known and `accept` or `reject` once it is. Verdicts are
  stored in a cache keyed by a stable proposal signature, so repeated proposals (the same
  two ports during one drag) cost no round trip. A verdict carries the signature and the
  graph revision it applies to and never approves a different or superseded candidate
  (TXN-05).
- **Pending resolution in the connect tool (view/interact).** While the target port is
  pending the target shows the pending state (PRT-06). A release on a pending target keeps
  the preview at the release point and commits nothing until the verdict arrives; an
  accepted verdict submits one connect command, a rejected one commits nothing and reports
  the reason. A new press outside overlay content or Escape cancels the wait.
- **Rejections reach the host.** A structured rejection from a verdict or from commit
  revalidation is delivered to a view-level host callback, in addition to the existing
  per-target reason in the preview.
- **Commit path.** Commit revalidation stays synchronous and uses the verdict cache; a
  pending or missing verdict at commit is rejected with the existing `pending-validation`
  reason, never accepted.

Requirement IDs refined: CON-04, CON-05, PRT-06, TXN-05, TXN-06, INT-08.
New IDs: CON-09 (host validator and verdict cache), CON-10 (rejection delivery),
INT-13 (pending target resolution).

## Out of Scope

- Docking and reconnect behavior while pending: those changes (`add-docking`,
  `add-reconnect-tool`) call into the mechanism defined here.
- The external model adapter, optimistic pending layer and synchronization modes
  (ADP-03 to ADP-06, TXN-02): this is validation of a proposal before it is submitted, not
  the adapter's later accept or reject of a submission.
- Domain rules themselves: the host supplies them as a validator or policy.
- Retry, backoff and transport of the host's request. The library only calls the validator
  and applies a configurable timeout.
- Async validation of non-connection edits.

## Dependencies

None. `add-docking` and `add-reconnect-tool` depend on this change; this change ships and
is verified with the connect tool alone.
