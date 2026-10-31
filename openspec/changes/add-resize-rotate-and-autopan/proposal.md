# Proposal

## Why

The model already stores size, quarter-turn rotation and a mirror flag, and core has
`rotateNodes` and `mirrorNodes` planners, but a user of the view can do none of it: there
are no resize handles, no rotate or mirror commands or shortcuts, and no declared size
limits, so NOD-04a ("respect minimum and maximum sizes") has nothing to enforce. Drawing a
physical-system schematic also needs gestures that reach past the visible area: today a
node drag, a connection drag or a marquee stops at the viewport edge and the user has to
drop, pan and pick it up again (INT-09). This is the second change of Slice B.

## What Changes

- **Size limits (core).** A node type declares optional minimum and maximum sizes; a host
  hook refines them per instance (for example from the payload). The resolved limits are
  queryable from the model, with a default minimum of one world unit.
- **`resizeNode` model command (core).** Sets a node's size with a named fixed point in the
  node's local frame (centre, an edge midpoint or a corner); the planner moves the centre
  so that point stays where it is, for any rotation and mirroring. A size outside the
  limits is rejected with `out-of-range`; nothing is clamped silently at the API.
- **Capability rules for compound updates (core).** The position change that an anchored
  resize implies is judged as part of the resize, and the rotation change that a mirror
  implies is judged as part of the mirror, so a node that may resize but not move can still
  be resized from its left edge. Any position or rotation change beyond those still needs
  `move` or `rotate`.
- **Vertical mirror (core).** `mirrorNodes` gains an `axis` (`horizontal` default, or
  `vertical`). Both axes are screen axes (see design Open Questions); a vertical mirror is
  stored as a horizontal mirror plus a half turn, so the data format is unchanged and one
  command is one history entry.
- **Resize tool (view).** Eight handles on a single selected resizable node, following its
  rotation and mirroring; dragging one keeps the opposite side or corner fixed, Shift keeps
  the aspect ratio, the size clamps to the limits during the drag, the preview lives on the
  interaction layer, and release commits one `resizeNode` (one history entry). No handles
  when several nodes are selected.
- **Rotate and mirror commands and shortcuts (view).** `nodes.rotate` and `nodes.mirror`
  editor commands over the selection, bound to R (clockwise), Shift+R (counter-clockwise),
  M (mirror horizontally) and Shift+M (mirror vertically) in the default keymap.
- **Auto-pan (view).** While a node drag, connection drag, marquee or resize is active and
  the pointer is inside an edge band (or outside the view), the viewport pans toward that
  edge at a speed that grows with depth up to a bound. It is driven by animation frames
  only while needed, stops in the same frame on release or cancel, and leaves no idle
  frames. The gesture still commits once on release.
- **Demo.** The plain-js demo's own M shortcut (move the pump from outside) moves to P;
  one demo type declares size limits.

Implements or refines: NOD-04 (vertical mirror, screen axes), NOD-04a (limits, anchored
resize, clamp-or-reject policy), new INT-10 (resize handles), INT-09 (SHOULD; auto-pan for
move, connect, marquee and resize), UX-01 (rotate and mirror shortcuts), INT-05 and INT-05a
(the resize tool is a state machine with full cancellation), INT-07 (shortcut and API run
the same command), INT-08 (one history entry per resize and per auto-panned gesture),
MOD-11 (capability gating for resize, rotate, mirror), PERF-02d (no frames after
auto-pan stops), GEO-05 (handle sizes in CSS pixels).

### Out of scope

- Replace node (EDT-01, SHOULD) and alignment guides (VIS-04, SHOULD): later, separate
  changes.
- Resizing several nodes at once, free (non-quarter) rotation, and rotation handles.
- Rotating a multi-node selection as one rigid group about its common centre (see design
  Open Questions); each node turns about its own centre.
- A per-record size-limit field in the document format. Per-instance limits come from the
  host hook, so snapshots are unchanged.
- Enforcing limits on raw patches, undo or load: only commands check them, so an older
  document whose sizes predate a limit still loads and undoes.
- React bindings for the new commands (react slice).

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `node-types`: NOD-04 gains vertical mirroring in screen axes, stored as a horizontal
  mirror plus a half turn; NOD-04a gains where limits are declared, the anchored resize,
  the clamp-in-gesture and reject-at-API policy, and the compound capability rule.
- `interaction`: new INT-10 defines the resize handles gesture; INT-09 (SHOULD) covers
  move, connect, marquee and resize, with bounded speed and no frames after it stops;
  UX-01 adds rotate and mirror commands and their default keys.

## Impact

- `src/core/data/node-types/definition.ts`: `NodeTypeDefinition.sizeLimits`; the registry
  rejects inconsistent limits. New `src/core/data/model/node-frame.ts`: the quarter-turn
  and mirror linear map shared by planners and the capability validator (core/edit cannot
  import core/space).
- `src/core/edit/commands/`: `Command` gains `resizeNode` and `mirrorNodes.axis`; new
  `resize-node.ts` and `size-limits.ts`; `transform-nodes.ts` learns the axis;
  `PlanContext` gains `sizeLimits`. `src/core/edit/capabilities/`: new
  `compound-fields.ts` used by `validator.ts`.
- `src/core/space/scene/`: `GeometryScene.project(id, placement)` returns a node entry for
  a hypothetical placement and size, for previews.
- `src/core/graph-model.ts`: `sizeLimits` option and method; `src/core/index.ts` exports.
- View: new `src/view/interact/tools/resize-tool.ts`, `resize-math.ts`, `auto-pan.ts`;
  new `src/view/interact/input/auto-pan-driver.ts`; new
  `src/view/render/paint/previews/resize-handles.ts`, `resize-preview-painter.ts`,
  `ghost-entries.ts`, and a handles painter; new
  `src/view/interact/commands/transform-commands.ts`; `keymap.ts`, `tool-types.ts`,
  `tool-router.ts`, `tool-context.ts`, `thresholds.ts`, `preview-types.ts`,
  `preview-host.ts`. `dom-input.ts` (316 lines) first sheds its pointer conversion into a
  new file before gaining the auto-pan hook.
- Docs: `docs/guide-using-the-model.md`, `docs/guide-view.md`, `docs/interaction.md`,
  `docs/geometry.md`; `examples/plain-js` changes its M key to P and declares limits.
- No new runtime dependencies. Core stays headless. Snapshot format unchanged.
