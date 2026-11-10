# Proposal

## Why

The connection gestures rule asks for optional endpoint reconnection and the rule that an existing binding survives a failed reconnection says a failed or cancelled
reconnect leaves the old connection intact. Core already supports it: the `reconnect`
command moves one end of a connection, keeps its ID, and passes `replacing` to the
policy so occupancy and duplicate checks ignore the old connection. No view tool starts it,
so users must delete and redraw a wire. This change adds the gesture.

## What Changes

- **Endpoint grips.** A selected connection shows a grip at each end, drawn in the style of
  the route-edit grips, with a capture radius in CSS pixels and a cursor change on
  hover.
- **Reconnect tool (view/interact).** A new tool, placed before the connect tool, starts
  when a press lands on an endpoint grip of a selected connection and Alt is not held.
  Because a grip sits on its port's anchor, that press would otherwise start a new
  connection from the port; holding Alt gives the press back to the connect tool, so a
  second wire can still be drawn from a port whose wire is selected. Past the drag threshold
  it detaches that end visually (the stored connection is untouched), previews a
  path from the fixed end to the pointer, and highlights candidate ports with the distinct target states rule
  target states, reusing the connect candidate search and evaluation. Releasing on a
  compatible port submits one `reconnect` command; releasing on empty space cancels or
  deletes by option; Escape, lost capture and the other causes from the gesture lifecycle and cancellation rule cancel,
  including a lost button release (`button-released`), a context menu before the drag
  threshold (`context-menu`), a second touch (`pinch`) and any change to an involved entity.
- **Single history entry.** One gesture is one `reconnect` command and one history entry;
  the ID is kept.
- **Policy sees `replacing`.** The tool evaluates candidates through the `reconnect`
  planner, so the connection being moved does not count against occupancy.
- **Option surface and default.** `ToolOptions.reconnect: ReconnectOptions | false`,
  following the existing `autoPan: AutoPanOptions | false` pattern: `ReconnectOptions` is
  `{ onEmptyDrop: "cancel" | "delete"; gripRadiusPx: number }` (defaults `cancel` and 8), and
  a partial object is filled with those defaults. **The tool is off by default**, like
  docking: a host turns it on with `reconnect: {}` (or any partial object). Off means no
  grips are drawn and a press on a wire end behaves as a press on the wire. This is a
  deliberate default: grips on port anchors change what a press on a port does, so the
  behavior is opt-in.
- **Entry points.** `ReconnectOptions` is a type of the main `view` entry, beside
  `ToolOptions`, because configuring tools is part of mounting. The tool factory
  `reconnectTool` is exported from `view/advanced` with the other built-in tool factories
  and the tool contract, which is documented as subject to change before 1.0.
- **Grip hover.** The grips are drawn on the interaction layer by the selected-wire overlay
  painter. Hovering a grip changes only the cursor; no node painter reads it, so no scene
  repaint and no `repaintOnHover` flag is involved.

Requirements implemented: the connection gestures rule (optional endpoint reconnection), the rule that an existing binding survives a failed reconnection and the policy-controlled topology features rule
(parallel connections individually reconnectable), the rule that connection identity is independent of presentation.
Refined: the gesture lifecycle and cancellation rule, the rule that gestures yield to any change of their entities, the lost pointer release rule, the tool contract on the advanced entry rule, the one committed edit per gesture rule, the rule that glyph, target, label and anchor are separate and the distinct target states rule.
New requirements: the endpoint reconnection gesture rule (endpoint reconnection gesture), the reconnect release and cancellation rule (reconnect release and cancellation).
Gesture cancellation on changes of the gesture's entities is the existing rule that a
gesture yields to any change of its entities (reasons `entity-removed`, `external-change`
and `entity-changed`); this change declares which entities its gesture involves.

## Out of Scope

- Reconnecting several selected connections at once and reconnecting a route's interior
  (route editing is `add-route-editing`, already done).
- Dragging a whole connection, and keyboard-driven reconnection (accessibility is limited
  to select, move, delete and undo; keyboard connection is proposed separately in
  `add-keyboard-navigation`, pending the owner's approval of that wider scope).
- Choice pickers for reconnect: a policy `choice` outcome behaves as with the connect tool
  without a chooser: nothing is committed and the cue is shown.
- Resetting route constraints on reconnect: existing pins are not reset; they stay as the
  `reconnect` planner leaves them (follow the current planner behavior; do not change it
  here).
- Asynchronous validation is not required here; see Dependencies.

## Dependencies

- The `involved` hook, the cancellation rule, the `connection-rejected` and
  `gesture-cancelled` events and the pending wait are in the specs and the code (the
  asynchronous connection policy is archived; the view hardening made every change of an
  involved entity cancel a gesture, whatever its origin). Nothing has to land first.
- Planned order, not a code dependency: this change, `add-docking`,
  `add-snapshot-sync-adapter`.
- Independent of `add-docking` otherwise: neither uses the other's code.
