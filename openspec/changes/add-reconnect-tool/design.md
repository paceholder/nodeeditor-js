# Design

## Context

- Core: `Command` has `reconnect { connection, end, target }`; `planReconnect`
  (`edit/commands/connect.ts`) builds a proposal with `replacing: existing.id`, so the
  default policy ignores the old connection (`default-policy.ts`), and emits one connection
  `update` op, keeping the ID. `disconnect` exists for the delete option.
- View: `connectTool` (`tools/connect-tool.ts`) already implements the press, threshold,
  candidate snap (`connect-candidates.ts`), evaluation to a presentation state
  (`connect-evaluation.ts`), preview kind `connect`, and cancellation set. Route editing
  added grips and a tool placed before `selectMove` (`route-edit-tool.ts`,
  `interact/route-edit/`); precedence in `default-tools.ts` is pan, resize, route-edit,
  connect, select-move, empty-pan, marquee.
- Capability checks decide whether a command is available (`can`).

## Goals / Non-Goals

**Goals:** a hand-rolled reconnect state machine reusing the connect candidate search; the
old connection untouched until commit; one history entry.

**Non-Goals:** batch reconnect, keyboard reconnect, choice picker, new policy rules.

## Decisions

### D1. A separate tool file, shared candidate code
Alternative: a mode of `connectTool`. Rejected: `connect-tool.ts` is already 169 lines with
its own state union, and the start condition differs (a grip of a selected connection, not a
port). The new `reconnect-tool.ts` imports `connect-candidates.ts` (candidate search,
snapping) and `connect-evaluation.ts`; the evaluation function takes the planner callback,
so reconnect passes `plan({ kind: "reconnect", ... })` while connect passes `connect`. If
that function needs a signature change it is made backwards compatible and covered by the
existing connect tests.

### D2. Grip geometry
Endpoint grips come from the scene's connection route (first and last vertex) and are
drawn by the selected-wire overlay painter beside the route-edit grips. The capture radius
is a tool option in CSS pixels (default 8) and has precedence over route-edit handles at
the endpoints: the end segment's grip of the segment editor is not at the vertex, but when
they overlap the endpoint grip wins (documented, tested).

### D3. State machine
`idle -> pressed(connection, end, startViewport) -> dragging(connection, end, fixed) -> idle`.
Pure transition function; effects: `preview` (kind `reconnect`: fixed point, pointer,
candidates, the moving end), `cursor`, `select` (click path), `submit` of `reconnect` or
`disconnect`. The preview keeps the stored connection painted normally and draws the
provisional path with the existing connect preview painter style plus a dashed ghost of the
detached end.

### D4. Start conditions
Only a selected connection with exactly one connection selected shows grips (batch is out of
scope). `can({ kind: "reconnect", ... })` for the pressed end must not be rejected with a
capability reason, otherwise the grip is drawn disabled and a press falls through to
select-move. Cursor: `grab` on hover, `crosshair` or `not-allowed` while dragging, following
`cursorFor` in the connect tool.

### D5. Release outcomes
- Compatible target: `submit reconnect`. Same port as the current end: no-op, nothing
  submitted (not a history entry).
- Choice outcome: nothing, with the existing cue (INT-12b).
- Empty space: `cancel`, or `disconnect` if `onEmptyDrop = "delete"`.
- Invalid port: nothing; the preview ends; rejection is delivered to the host callback if
  `add-async-connection-policy` has landed (`onRejection`), otherwise only shown at the
  target before release.

### D6. Pending targets
Before the async change, a pending evaluation maps to the `pending` state as in the
connect tool and a release on it commits nothing. After it, task 3.1 reuses the INT-13 wait
state. The two paths use the same planner result, so no tool code depends on which exists.

## Risks / Trade-offs

- Overlap of grips with route-edit handles near the end: resolved by D2 precedence, with a
  browser test; if the two interfere in practice the endpoint capture radius is lowered.
- Reconnect of an undirected connection can swap which end is `from`: the planner already
  normalizes by policy; the tool displays the dragged end by the pressed end of the stored
  record and does not assume orientation.
- Existing route pins on a reconnected wire: unchanged by this change; recorded in the
  proposal as out of scope.

## Open Questions

1. Should pins of the connection be reset on reconnect (the old route may not fit the new
   endpoint)? Proposed: no change now; revisit after trying it in the demo.
2. Default for `onEmptyDrop`: `cancel` (proposed, matches CON-07).
