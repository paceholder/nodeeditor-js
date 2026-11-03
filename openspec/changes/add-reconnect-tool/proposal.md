# Proposal

## Why

INT-04 asks for optional endpoint reconnection and CON-07 says a failed or cancelled
reconnect leaves the old connection intact. Core already supports it: the `reconnect`
command moves one end of a connection, keeps its ID (CON-08), and passes `replacing` to the
policy so occupancy and duplicate checks ignore the old connection. No view tool starts it,
so users must delete and redraw a wire. This change adds the gesture.

## What Changes

- **Endpoint grips.** A selected connection shows a grip at each end, drawn in the style of
  the route-edit grips, with a capture radius in CSS pixels (PRT-05) and a cursor change on
  hover.
- **Reconnect tool (view/interact).** A new tool, placed before the connect tool, starts
  when a press lands on an endpoint grip of a selected connection. Past the drag threshold
  it detaches that end visually (the stored connection is untouched, CON-07), previews a
  path from the fixed end to the pointer, and highlights candidate ports with the PRT-06
  target states, reusing the connect candidate search and evaluation. Releasing on a
  compatible port submits one `reconnect` command; releasing on empty space cancels or
  deletes by option; Escape, lost capture and the other INT-05 causes cancel.
- **Single history entry.** One gesture is one `reconnect` command and one history entry
  (INT-08); the ID is kept.
- **Policy sees `replacing`.** The tool evaluates candidates through the `reconnect`
  planner, so the connection being moved does not count against occupancy.
- **Option and command surface.** `ToolOptions.reconnect: { onEmptyDrop: "cancel" | "delete" }`
  (default `cancel`), and a way to turn the tool off.

Requirement IDs implemented: INT-04 (optional endpoint reconnection), CON-07, CON-02
(parallel connections individually reconnectable), CON-08.
Refined: INT-05, INT-08, PRT-05, PRT-06.
New IDs: INT-14 (endpoint reconnection gesture), INT-14a (reconnect target resolution).

## Out of Scope

- Reconnecting several selected connections at once and reconnecting a route's interior
  (route editing is `add-route-editing`, already done).
- Dragging a whole connection, and keyboard-driven reconnection (accessibility is limited
  to select, move, delete and undo).
- Choice pickers for reconnect: a policy `choice` outcome behaves as with the connect tool
  without a chooser (INT-12b): nothing is committed and the cue is shown.
- Resetting route constraints on reconnect: existing pins stay as the `reconnect` planner
  leaves them (follow the current planner behavior; do not change it here).
- Asynchronous validation is not required here; see Dependencies.

## Dependencies

- Soft dependency on `add-async-connection-policy`: the tool treats `pending` evaluations
  with the same target-state mapping as the connect tool. When that change has landed, a
  release on a pending target reuses its wait mechanism (INT-13) and a task in this change
  (3.1) extends the tests; before it lands, a pending target is shown as pending and
  release commits nothing.
- Independent of `add-docking`.
