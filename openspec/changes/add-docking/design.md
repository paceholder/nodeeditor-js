# Design

## Context

- Spec only: `src` has no docking code. Relevant existing pieces: the select-move tool
  (`tools/select-move-tool.ts`, move offset in `move-offset.ts`, snapping in INT-03), the
  connect candidate search and target-state mapping (`tools/connect-candidates.ts`,
  `connect-evaluation.ts`), the connect planner with `PlanResult` (`edit/commands/connect.ts`),
  `moveNodes` (`transform-nodes.ts`) and the scene spatial index in `core/space`.
- Previews live in the interaction layer and are never serialized (INT-08);
  `ToolPreview` is a discriminated union in `render/paint/previews/preview-types.ts`.
- Ghost entries re-route moved connections during a move preview (`ghost-entries.ts`).

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
screen space (PRT-05, GEO rules); it never reads pixels.

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
`dock` core command `{ moves: [{ node, to }], connect: ConnectCommandArgs }` plans the
move with `planMoveNodes` and the connect with the connect planner on the staged result,
merges the two into one patch labeled "Dock", and returns the first rejection or choice.
In `snap` mode the offset is the anchor-coincidence delta (clamped by the same size/limit
rules as a move); in `connect` mode it is the plain drag offset. The preview kinds are
`dock` (line plus optional snapped ghost) with the PRT-06 state of the target port.

### D5. Choice outcomes
If the policy answers choice-required for the candidate, the preview shows the existing
choice cue and a release performs the plain move (as with INT-12b without a chooser). The
chooser integration is not extended in this change; recorded as non-goal.

### D6. Pending (DCK-07)
Candidates carry `evaluation.state === "pending"` from the async policy. In `snap` mode a
pending candidate does not snap. Release behavior is the option `onPendingRelease:
"move-only" | "wait"` (default `move-only`). `wait` reuses the awaiting mechanism of
INT-13: no commit until a verdict, a new press or Escape cancels it. Applied after
`add-async-connection-policy`.

### D7. Option surface and modifier
`ToolOptions.docking?: { enabled; mode: "snap" | "connect"; radiusPx (default 40); suppress: modifier (default Alt);
hysteresisPx; onPendingRelease }`. Absent means disabled and the move tool takes no new
code path (DCK-02).

### D8. Zero-length selection mark (DCK-05)
The connection painter draws a small ring at the anchor when the path length is below one
pixel and the connection is selected. Selection and deletion need no change because
selection is by ID.

## Risks / Trade-offs

- Per-frame policy evaluation for several candidates: the finder evaluates at most the 3
  nearest and caches by signature within the gesture (the async cache of
  `add-async-connection-policy` extends this).
- Snap plus size limits could make the snapped position invalid: the command is rejected as
  a whole and the preview falls back to the plain move.

## Open Questions

1. Default of `onPendingRelease`: `move-only` proposed (never surprises); confirm.
2. Default suppression modifier (Alt proposed; check against INT-03 snapping modifier).
3. Default radius 40 CSS px proposed.
