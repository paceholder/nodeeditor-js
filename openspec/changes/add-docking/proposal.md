# Proposal

## Why

The docking requirements are specified but nothing implements them. A schematic or wiring editor
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
  connect planner (`PlanResult`), and reuses the target states of the distinct target states rule.
- **Docking in the move gesture.** The select-move tool gains the option `docking: DockingOptions | false` (`false`, so off, by
  default, the opt-in and suppressible docking rule) with a suppression modifier. While moving, the best candidate is
  previewed: a line between the two ports (connect-only mode) or a ghost at the snapped
  position with the line (snap mode). An incompatible nearby port shows its reason and does
  not capture the drag.
- **Two modes.** `snap` (the node moves so anchors coincide) and
  `connect` (position kept, only the connection is added). An option selects the mode.
- **Atomic dock command (core/edit).** A `dock` command (moves given as `{ node, position }`, like `moveNodes`) composes the move plan and the
  connect plan into one patch and one history entry; a rejected dock plan
  changes neither position nor connection.
- **Undocking and zero-length wires.** Connections created by docking behave like any
  other: dragging the nodes apart keeps them; coincident anchors leave them
  selectable through the command API and the inspector selection path.

Defaults when docking is turned on: mode `snap`, radius 40 CSS px, hysteresis 6 CSS px, Alt suppresses, `onPendingRelease` is
`move-only` (a host may choose `wait`).

Requirements implemented: the docking candidate preview rule, the opt-in and suppressible docking rule, the atomic dock commit rule, the rule that undocking preserves connections and the rule that zero-length connections stay addressable.
Refined: the attachment limits rule (occupied ports are excluded when the limit says so, through the policy),
the distinct target states rule, the group movement and snapping rule, the one committed edit per gesture rule and the one policy for all input routes rule.
New requirements: the connect-without-moving mode rule (connect-without-moving mode), the docking under pending validation rule (docking under pending validation).

## Out of Scope

- Merging node identities or inserting auxiliary nodes (the spec forbids it; the no implicit conversions rule plans
  are shown, never invented).
- Docking during node creation from a palette: only moves of existing nodes and the
  placement of an already created node. Palette drop is a host concern.
- Multi-connection docks (one dock creates at most one connection), group docking that
  connects several port pairs at once.
- The asynchronous validator itself (`add-async-connection-policy`) and endpoint
  reconnection (`add-reconnect-tool`).
- Auto-pan changes (the auto-pan rule already applies to node moves).

## Dependencies

- **Hard dependency on `add-async-connection-policy`.** The move tool declares the entities a
  docking gesture involves through the `involved` hook and relies on the cancellation rule,
  the verdict cache, the wait mechanism and the `connection-rejected` and
  `gesture-cancelled` events that change defines; it also needs the view lock from
  `add-react-integration`. Apply and archive this change after the async policy. Archive
  order: async policy, `add-reconnect-tool`, this change, `add-snapshot-sync-adapter`.
- `add-reconnect-tool` does not depend on this change, and this change does not use its code.
