# Proposal

## Why

`add-canvas-view-foundation` draws a graph but nothing can be edited with a pointer or
keyboard. Slice A's exit evidence (UC-01, UC-03) needs a user to pan, zoom, select, move
nodes, and draw a connection between compatible ports. Every gesture must produce exactly
one command through the same command path as the API. This change adds the first
interaction tools as explicit state machines (INT-05a), so their behavior is testable in
Node before any browser test runs.

## What Changes

- **Tool runtime.** Library-defined input events (pointer, wheel, key, cancel, blur,
  visibility, entity-removed) feed tools. A tool is a pure transition function that returns
  its next state plus effects: preview, commit, select, set viewport, capture/release
  pointer, cursor. A runner executes the effects. Exactly one gesture is active at a time.
- **DOM input adapter.** Pointer, wheel, and keyboard listeners attach to the view root on
  mount and detach on dispose. The adapter handles pointer capture and translates
  `pointercancel`, `lostpointercapture`, window `blur`, `visibilitychange`, and dispose into
  cancellation. Keyboard and wheel input is scoped to the focused editor, and keys typed in
  text fields, `contentEditable` elements, or during IME composition are ignored.
- **Selection.** A view-local selection model, independent per view, with single, additive,
  and toggle clicks, clear on empty click, and marquee selection. A left-to-right marquee
  uses containment and a right-to-left marquee uses intersection. Nodes and connections are
  selectable together.
- **Navigation.** Pan by middle-button drag or Space+drag. The wheel zooms anchored at the
  cursor, clamped to the zoom range. Commands for fit-all, fit-selection, reset view, and
  reveal entity; the fit commands are no-ops when empty.
- **Move tool.** Moves the selection with a drag threshold, preserving relative positions,
  with optional grid snapping and an Alt suppression modifier. Capability checks show locked
  nodes as not moving. One move command is committed on release.
- **Connect tool.** Drag-to-connect from a port. Candidate ports within the screen-space
  capture radius are evaluated by the active connection policy and shown as compatible,
  incompatible, occupied, or unavailable, with a reason and a non-color cue. Release on a
  compatible port commits one connect command, which is revalidated at commit. Any other
  release cancels.
- **Editor command registry.** Identifiable commands with availability queries and Result
  outcomes, shared by shortcuts, menus, toolbars, and the API: delete, undo, redo, select
  all, clear selection, nudge selection, and the viewport commands. The default keymap uses
  the platform modifier.
- **Interaction-layer painting.** Paints the marquee, moved-node ghosts and their incident
  paths, the provisional connection path, and candidate port states. Previews repaint only
  the interaction layer. Nothing is submitted to the adapter before commit.

Implements: INT-01, INT-02, INT-03 (without mixed-selection subset dialogs), INT-04 (only
the drag-to-connect part), INT-05, INT-05a, INT-06, INT-07, INT-08, UX-01 (subset: select,
move selected, delete, undo/redo; reveal through a command), UX-02 (non-color target cues),
PRT-06 (target states for simple ports), GEO-05 (screen-space capture and threshold), MOD-10
(view-local selection and viewport), MOD-11 (capability-aware previews and commands), CON-03
(gestures use the same policy and commands as the API).

### Out of scope

- Click-to-route, corner backtrack, endpoint reconnection, and the right-click routing
  behavior (INT-04, remainder). These come in Slice B.
- Auto-pan near the edges (INT-09), docking (DCK-*), junction drops (JNC-02), and
  composite-member previews (SIG-05).
- Context menus and the "open context actions" shortcut (UX-01 remainder). These need the
  overlay menu UI planned for Slice B. The registry already exposes the commands a menu
  would list.
- Touch and pen-specific UX. Those events go through the same pointer path but have no
  dedicated gestures.
- Locked-subset confirmation UI. Mixed selections move the permitted subset, and the
  preview marks the rest.

## Capabilities

### New Capabilities

None. The requirements already exist in the baseline specs `interaction`, `ports`,
`geometry`, `graph-model`, and `connection-policy`. This change implements them without
changing their behavior, so its `.openspec.yaml` sets `skip_specs: true`.

### Modified Capabilities

None.

## Impact

- New modules: `src/view/interact/tools/` (pure state machines; no DOM types, so they run
  in the Node test environment), `src/view/interact/input/` (DOM adapter),
  `src/view/interact/selection/`, `src/view/interact/commands/`, and
  `src/view/render/paint/previews/`.
- Depends on:
  - `add-canvas-view-foundation`: `ViewHandle`, viewport API, `clientToWorld`, `pick`,
    interaction painters, `element`, and the `selected`/`hovered` inputs of the scene painter.
  - `add-geometry-and-spatial-index`: `HitCandidate`, picking, port anchors, path builders,
    and the viewport transform.
  - `add-commands-and-policy`: the move, connect, and delete command planners and policy
    evaluation.
  - `add-patches-and-history`: submission, history, and change events.
- `mountView` gains an option to enable the default tool set (on by default), plus a
  `ViewHandle.commands` and `ViewHandle.selection` surface.
- No new runtime dependencies.
