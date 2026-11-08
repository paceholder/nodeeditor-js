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
  `interact/route-edit/`); the precedence in `default-tools.ts` is pan, resize, connect,
  route-edit, select-move, empty-pan, marquee. Connect precedes route editing, so ports
  win over route handles.
- `evaluationOf(plan, target, reader)` (`connect-evaluation.ts`) already takes a
  `PlanResult`, so it needs no change. The connect-specific parts are
  `ToolContext.evaluateConnection(from, to)` (`tool-context.ts`), which always plans
  `connect` and caches by `from>to` pair, and `connect-candidates.ts`, which calls it
  directly.
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
snapping) and `connect-evaluation.ts`. Two changes make that possible. The candidate search
takes the evaluation function as a parameter (the connect tool passes
`ctx.evaluateConnection`). The tool context gains
`evaluateReconnect(connection, end, target)`, which plans a `reconnect` command, whose
proposal carries `replacing`, and caches its evaluation under a key that includes the
connection, the end and the target port. A key of `from>to` alone would be wrong: the same
port pair evaluates differently depending on which connection is being replaced (occupancy,
duplicates). Both caches are cleared with the model revision and when the verdict cache
notifies.

### D2. Grip geometry
Endpoint grips come from the scene's connection route (first and last vertex) and are
drawn by the selected-wire overlay painter beside the route-edit grips. The capture radius
is a tool option in CSS pixels (default 8). The reconnect tool is registered before the
connect tool, hence also before route editing, so at the endpoints the endpoint grip wins
over a route handle; the end segment's grip of the segment editor is not at the vertex, but
when they overlap the endpoint grip wins (documented, tested).

### D3. State machine
`idle -> pressed(connection, end, startViewport) -> dragging(connection, end, fixed) -> idle`.
Pure transition function; effects: `preview` (kind `reconnect`: fixed point, pointer,
candidates, the moving end), `cursor`, `select` (click path), `submit` of `reconnect` or
`disconnect`. The preview keeps the stored connection painted normally and draws the
provisional path with the existing connect preview painter style plus a dashed ghost of the
detached end.

### D4. Start conditions
Only a selected connection with exactly one connection selected shows grips (batch is out of
scope).

**Press rule.** The tool claims a press when all of these hold: the tool is enabled, exactly
one connection is selected, the press is within the grip radius of one of its ends, and Alt
is not held. Because a grip sits on a port's anchor, the tool is registered before the
connect tool; without the Alt exception a user could never start a second connection
from a port while a wire at that port is selected. With Alt held the press goes on to the
connect tool, and a click on empty canvas (deselecting) also brings back the normal press on
a port. The cursor over a grip shows `grab` only while Alt is not held. `can({ kind: "reconnect", ... })` for the pressed end must not be rejected with a
capability reason, otherwise the grip is drawn disabled and a press falls through to
select-move. Cursor: `grab` on hover, `crosshair` or `not-allowed` while dragging, following
`cursorFor` in the connect tool.

### D5. Release outcomes
- Compatible target: `submit reconnect`. Same port as the current end: no-op, nothing
  submitted (not a history entry).
- Choice outcome: nothing, with the existing cue.
- Empty space: `cancel` by default (matches the rule that an existing binding survives a failed reconnection), or `disconnect` if `onEmptyDrop = "delete"`.
- Invalid port: nothing; the preview ends; the rejection is emitted as the
  `connection-rejected` view event and was shown at the target before release.

### D6. Pending targets
A pending evaluation maps to the `pending` state as in the connect tool. A release on a
pending target enters the same wait as the connect tool: the preview stays at the
release point, an accepted verdict submits one `reconnect` (re-planned and revalidated at
commit), a rejected one commits nothing and emits `connection-rejected`. The wait state and
the `request-verdict` and `validate-wait` effects come from `add-async-connection-policy`,
which this change requires.

### D7. Options and turning the tool off
`ToolOptions.reconnect: ReconnectOptions | false`, the same shape as `autoPan`. **The default
is `false`**: the tool is off unless the host passes an object. The values filled into a
partial object are `{ onEmptyDrop: "cancel", gripRadiusPx: 8 }`. `resolveToolOptions` merges
only the top level, so a partial `{ onEmptyDrop: "delete" }` would drop the radius; the
resolver therefore fills nested defaults for `reconnect` (and, in `add-docking`, for
`docking`). Off makes the tool decline every press and draws no grips. Omitting the tool
from the `tools` list of the mount options works too and needs no code.

### D8. Entities the gesture involves
The tool's `involved(state)` returns the connection ID, the fixed end's port and, while
dragging, the hovered target port. The rule that cancels the gesture when one of them is
removed or changed externally is the rule that gestures react to changes of the entities they involve of `add-async-connection-policy`; this tool adds no
rule of its own.

## Risks / Trade-offs

- Alt is the escape hatch for starting a new wire from a port whose wire is selected. It is
  also the key that suppresses docking and grid snapping elsewhere; for a press (not a drag
  in progress) there is no clash, and the guide states the rule.
- Overlap of grips with route-edit handles near the end: resolved by D2 precedence, with a
  browser test; if the two interfere in practice the endpoint capture radius is lowered.
- Reconnect of an undirected connection can swap which end is `from`: the planner already
  normalizes by policy; the tool displays the dragged end by the pressed end of the stored
  record and does not assume orientation.
- Existing route pins on a reconnected wire: not reset on reconnect. This is settled for
  now (hosts do not use manual pins yet) and recorded in the proposal as out of scope.
