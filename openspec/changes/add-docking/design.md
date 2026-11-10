# Design

## Context

- Spec only: `src` has no docking code. Relevant existing pieces: the select-move tool
  (`tools/select-move-tool.ts`, move offset in `move-offset.ts`, snapping in the group movement and snapping rule), the
  connect candidate search and target-state mapping (`tools/connect-candidates.ts`,
  `connect-evaluation.ts`), the connect planner with `PlanResult` (`edit/commands/connect.ts`),
  `moveNodes` (`transform-nodes.ts`) and the scene spatial index in `core/space`.
- Previews live in the interaction layer and are never serialized;
  `ToolPreview` is a discriminated union in `render/paint/previews/preview-types.ts`.
- Ghost entries re-route moved connections during a move preview (`ghost-entries.ts`).
- The tool router cancels a gesture when a committed change of any origin removes or
  changes an entity listed by the tool's `involved(state)`: reason `entity-removed`,
  `external-change` (origin `external`) or `entity-changed` (a local edit, undo or redo).
  The select-move tool lists the pressed node, then the moved and locked nodes.
- Record validation refuses a node position outside plus or minus 1e7 (`out-of-range`), so
  a planned move to such a position is rejected like any other invalid patch.
- Tool-writing names (the tool contract and the built-in tool factories) are exported from
  `view/advanced`; `ToolOptions` and its option types stay in `view`.
- Every refusal is carried in a field named `rejection` (plan results, availability,
  policy outcomes, the `connection-rejected` event); `reason` is only plain text, as in the
  `unverified` execute result.

## Goals / Non-Goals

**Goals:** deterministic ranking with hysteresis; both modes; one atomic command; docking
off by default and suppressible; compatibility only from the policy.

**Non-Goals:** group docking, palette drop, auxiliary nodes, merge of identities.

## Decisions

### D1. Candidate finder is a pure view-layer function
`findDockCandidates(input)` in `view/interact/docking/dock-candidates.ts`. Input: the moved
nodes' port anchors at the current offset, the scene queries (ports near a point via the
spatial index), the radius in CSS pixels converted by zoom, the previous choice, and an
`evaluate(from, to)` callback built on the connect planner. Output: ordered candidates with
`{ moving, target, distancePx, facing, evaluation }`. It lives in view because radius is
screen space (GEO rules); it never reads pixels.

### D2. Ranking and hysteresis
Order key: compatible or pending before incompatible; then distance bucketed to 1 CSS px;
then `facing` (dot of normals, more opposed first); then target port ID. The previous
choice keeps its place while it stays within radius and is within a hysteresis margin
(default 6 px, option) of the best distance. Incompatible candidates are reported only for
the nearest one so a reason can be shown, and never become the capturing candidate.

### D3. Only one dock per gesture
At most one connection per release: the best compatible candidate over all moving ports.
With several moved nodes, the candidate search uses the nodes' ports whose node is in the
moved set and targets outside it. Multi-port docks are out of scope.

### D4. Modes through one preview and one command
`dock` core command `{ moves: [{ node, position }], connect: ConnectCommandArgs }` (the same
`{ node, position }` entries as `moveNodes`) plans the
move with `planMoveNodes` and the connect with the connect planner on the staged result,
merges the two into one patch labeled "Dock", and returns the first rejection, choice or
pending outcome. A rejection is the plan result's `rejection`; a snapped position outside the
supported world range is refused by record validation with `out-of-range`, so the whole
dock is rejected and the preview falls back to the plain move. A pending outcome (the candidate's verdict is unknown) is returned as the
existing `unverified` result and commits nothing; the tool decides what to do with it (D6).
In `snap` mode the offset is the anchor-coincidence delta (clamped by the same size/limit
rules as a move); in `connect` mode it is the plain drag offset. The preview kinds are
`dock` (line plus optional snapped ghost) with the target state of the target port.

### D5. Choice outcomes
If the policy answers choice-required for the candidate, the preview shows the existing
choice cue and a release performs the plain move (as with a release without a chooser). The
chooser integration is not extended in this change; recorded as non-goal.

### D6. Pending
Candidates carry `evaluation.state === "pending"` from the async policy. In `snap` mode a
pending candidate does not snap. Release behavior is the option `onPendingRelease:
"move-only" | "wait"`. The library default is `move-only`, which never surprises; a host
that validates after release sets `wait`, so a quick release during a round trip does not
lose the connection. `wait` reuses the awaiting mechanism of the pending target resolution rule: nothing commits until
a verdict, and Escape, a new press, locking the view and the rule for changes to involved entities cancel
the wait.

What `wait` commits, step by step:
1. While waiting, the node stays drawn at the position where it was released, with the
   pending cue on the candidate. Nothing is submitted.
2. Accepted verdict: the `dock` command is planned again at that moment. In `snap` mode the
   move is to the position where the anchors coincide, computed from the anchors now; in
   `connect` mode it is the released position. The result is one patch, one history entry.
3. If that re-plan is rejected (the candidate filled meanwhile, size limits) nothing is
   committed, exactly as for any rejected dock. The user drags again.
4. Rejected verdict (or a failed or timed-out validator): the candidate is simply not a
   candidate, so the plain move to the released position is committed and the rejection is
   reported with the `connection-rejected` view event, as for an incompatible neighbour
   (the docking candidate preview rule: the node still moves freely).

The two fallbacks differ on purpose. A rejected verdict is an answer about the connection
only, so the move the user asked for still stands. A rejected re-plan means state changed
under the whole atomic plan; the atomic dock commit rule restores the prior state and commits neither part.

### D7. Option surface and modifier
`ToolOptions.docking: DockingOptions | false`, following the existing
`autoPan: AutoPanOptions | false` pattern. The default is `false`: docking is off and the
move tool takes no new code path. `DockingOptions` is `{ mode: "snap" | "connect";
radiusPx; hysteresisPx; suppress: modifier; onPendingRelease }` with defaults `snap`, 40 CSS
px, 6 CSS px, Alt and `move-only`. Alt no longer has a snapping meaning: the Alt override of grid
snapping is removed (see `add-host-integration-checks`), so Alt only suppresses docking
here (and bypasses a wire-end grip in the reconnect tool). The modifier stays configurable
through `DockingOptions.suppress`. There is no separate `enabled` flag: an object turns docking on and
`false` turns it off. `resolveToolOptions` merges only the top level, so it is extended to
fill nested defaults: a host that passes `{ mode: "connect" }` still gets the radius,
hysteresis, modifier and release behavior defaults.

### D8. Zero-length selection mark
The connection painter draws a small ring at the anchor when the path length is below one
pixel and the connection is selected. Selection and deletion need no change because
selection is by ID.

### D9. Entities the gesture involves
While moving, the select-move tool's `involved(state)` lists what it lists today (the moved
and locked nodes); the docking candidate is not involved. The candidate is found again on
every frame, so a change to it, from any origin, changes the preview or drops the candidate
on the next frame instead of cancelling the move. Since a change of any origin to an
involved entity now cancels the gesture (`entity-changed` for a local edit, undo or redo),
listing the candidate would let a host's live update of a nearby node cancel the user's
drag. While waiting under `wait`, the commit depends on the candidate, so `involved(state)`
lists the moved nodes, the moving port, the candidate port and the candidate's node. The
existing router rule cancels the gesture or the wait when one of them is removed or
changed; docking adds no rule or reason of its own. The gesture's own `dock` commit never
cancels it.

Rejected: listing the candidate while moving (the original plan, written when only external
changes cancelled a gesture).

## Settled Questions

- Decided: Alt is no longer overloaded. Grid snapping has no per-gesture override (the Alt
  override is removed by `add-host-integration-checks`), so Alt means only "do not dock" for a
  move, and the docking modifier stays configurable through `DockingOptions.suppress`.

## Risks / Trade-offs

- Per-frame policy evaluation for several candidates: the finder evaluates at most the 3
  nearest and caches by signature within the gesture (the model's verdict cache for the
  asynchronous validator extends this).
- Snap plus size limits could make the snapped position invalid (beyond the world range,
  say): the command is rejected as a whole and the preview falls back to the plain move.
- A host that streams local changes to a dragged node cancels the drag with
  `entity-changed`; this is the general trade-off of the any-origin cancellation rule.
  Changes to the candidate do not cancel the drag (D9).
- Moving nodes translates the pinned routes of their connections in the same patch; the
  dock patch keeps each route within the 256 route constraints a connection may hold, as
  it only moves existing pins.
