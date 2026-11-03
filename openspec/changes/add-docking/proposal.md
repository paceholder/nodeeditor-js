# Proposal

## Why

DCK-01 to DCK-05 are specified but nothing implements them. A schematic or wiring editor
wants the shortcut of dragging a component next to another and releasing to connect the
facing ports, without a separate connect gesture. Two behaviors are needed: the specified
one, where the node snaps so anchors coincide, and a second one where the node stays where
it was dropped and only the connection is created. Compatibility must come from the
connection policy, including its asynchronous verdicts, never from docking code.

## What Changes

- **Dock candidate finder (view/interact).** A pure function ranks the ports of other nodes
  near the ports of the dragged node: radius in screen pixels, then compatibility,
  distance, orientation (normals facing each other), and a stable tie-break by port ID,
  with hysteresis. It uses the scene's spatial index and the policy through the existing
  connect planner (`PlanResult`), and reuses the target states of PRT-06.
- **Docking in the move gesture.** The select-move tool gains a docking option (off by
  default, DCK-02) with a suppression modifier. While moving, the best candidate is
  previewed: a line between the two ports (connect-only mode) or a ghost at the snapped
  position with the line (snap mode). An incompatible nearby port shows its reason and does
  not capture the drag (DCK-01).
- **Two modes.** `snap` (the node moves so anchors coincide, DCK-01 and DCK-03) and
  `connect` (position kept, only the connection is added). An option selects the mode.
- **Atomic dock command (core/edit).** A `dock` command composes the move plan and the
  connect plan into one patch and one history entry (DCK-03, INT-08); a rejected dock plan
  changes neither position nor connection.
- **Undocking and zero-length wires.** Connections created by docking behave like any
  other: dragging the nodes apart keeps them (DCK-04); coincident anchors leave them
  selectable through the command API and the inspector selection path (DCK-05).

Requirement IDs implemented: DCK-01, DCK-02, DCK-03, DCK-04, DCK-05.
Refined: PRT-04 (occupied ports are excluded when the limit says so, through the policy),
PRT-06, INT-03, INT-08, CON-03.
New IDs: DCK-06 (connect-without-moving mode), DCK-07 (docking under pending validation).

## Out of Scope

- Merging node identities or inserting auxiliary nodes (the spec forbids it; CON-06 plans
  are shown, never invented).
- Docking during node creation from a palette: only moves of existing nodes and the
  placement of an already created node. Palette drop is a host concern.
- Multi-connection docks (one dock creates at most one connection), group docking that
  connects several port pairs at once.
- The asynchronous validator itself (`add-async-connection-policy`) and endpoint
  reconnection (`add-reconnect-tool`).
- Auto-pan changes (INT-09 already applies to node moves).

## Dependencies

- Depends on `add-async-connection-policy` for DCK-07 and for judging candidates against
  host validators. DCK-01 to DCK-06 work with a synchronous policy and can be implemented
  and verified before it lands; the pending tasks (3.x) are applied after it.
- `add-reconnect-tool` does not depend on this change.
