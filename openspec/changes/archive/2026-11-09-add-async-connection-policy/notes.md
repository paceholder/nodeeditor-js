# Implementation notes

Decisions taken while applying the change, where the design left room.

- **Pending targets are release targets only with a validator.** A target whose evaluation
  is `pending` is offered as the release target only when a verdict service is installed
  (`ToolContext.verdictsInstalled`). A host policy that answers `pending` for its own
  reasons, with no verdict cache, behaves as before: nothing to wait for, nothing committed.
- **Releasing over a refused port reports the refusal.** A release over the nearest port
  whose evaluation carries a rejection code emits `connection-rejected` with source
  `gesture`, whatever the code (type mismatch, capacity, a validator failure).
- **A wait has no pointer.** The router reports no active pointer while the connect tool
  waits, so hover tracking resumes and pointer capture is released at the release. Blur, a
  hidden tab, a lost capture and a pointer cancel do not end a wait, because no pointer is
  down; Escape, a new press, disposal, a reset, a lock and the rule that gestures react to changes of the entities they involve cancellations do.
- **`wanted` is the running connect gesture's latest requested pair.** When a verdict is
  discarded as stale, it is requested once more only if a connect gesture is running and the
  discarded pair is the last one the gesture asked about and the connection can still be
  planned (a request is never made for a port that no longer exists). A pair the user has
  moved away from but that was the last one asked about still counts; the extra request is
  shared and cached.
- **A view forgets the failures it asked for when its gesture ends**, committed or not,
  through the same hook that aborts requests nobody wants. A failure that another view also
  asked about stays until that view ends its own gesture, so one view never clears what
  another is showing. A failure nobody named as asker (a programmatic `verifyConnections`)
  stays until it is asked again.
- **A hovered target whose verdict is dropped is asked about again.** A change that touches
  the hovered or waited-on pair removes its verdict from the cache; the connect tool treats
  every verdict notification as a reason to ask again for a target that is pending, which is
  free because the request joins one in flight and a known verdict is not pending.
- **A new press while waiting** cancels with the reason `new-press`, which is not reported
  to the host as a cancelled gesture (it is the user's own action).
- **The pending cue needed no new painter.** The target-state painter already drew a pending
  state with its own glyph and a dashed provisional wire, but no policy could produce it. The
  work was making a pending target reachable and testing that its glyph differs in shape from
  compatible, incompatible and choice-required with every state set to one colour.
- **A host's own message and entities already reach the event; its own code does not.** A
  verdict's `reason` carries code, message and entity IDs unchanged into the rejection and
  the `connection-rejected` event, so the host can show its own text (the plain demo does).
  The code is typed as the library's `RejectionCode` union, so a host-specific machine code
  has no typed place: the runtime passes an unknown string through, but the type does not
  allow it. No `detail` field was added; if hosts need one, it is a small addition to
  `Rejection` and the verdict shape, to be decided separately.
- **A picked alternative is judged like a pending target.** Decision: the choice
  controller (outside the router, because no pointer is down while the host picks) owns the
  wait, rather than putting the connect tool back into `awaiting`. After a pick it plans the
  connect command; if that plans as pending it enters a `verifying` state of the same choice
  (same token, signal, ids and cancellations: Escape, a press outside overlay content,
  lock, reset, a new chooser, dispose, and removal or an external change of an involved
  port or node, as for a gesture), redraws the preview with the target pending, and asks the
  verdict driver for the picked plan. When a verdict settles it plans again and, once the plan
  is not pending, commits; the model's result reports a refusal as `connection-rejected`
  with source `gesture`. It commits before telling the driver the wait is over, because
  ending forgets failed verdicts, and its own commit does not cancel it (the choice is idle
  by then). A wait that a removal or an external change ends is reported as
  `gesture-cancelled`; a local change of an involved entity is not a cancellation, as for a
  gesture. A choice the host is still deciding is cancelled by a removal only. The mount layer
  does not end the driver's gesture while a choice is open (a synchronous chooser answers
  inside the release effects).
- **Seeding a model that has a validator** needs the same two steps as any programmatic
  connection: run the command, `verifyConnections` the `missing` list, repeat the command
  (`examples/plain-js/main.ts`).
- **Known and accepted: file sizes.** `verdict-cache.ts` (about 420 lines) and
  `connect-tool.ts` (about 320) are above the 100-300 line guide; each holds one state
  machine whose parts share private state, and splitting them now would only move
  parameters around. `view-editing.ts` was already large before this change.
