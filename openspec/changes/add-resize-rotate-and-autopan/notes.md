# Implementation notes

Deviations from design.md, clarifications made while implementing, and observations.

## Deviations and clarifications

- **`DEFAULT_MIN_SIZE` lives in `core/data/node-types/definition.ts`** so the registry
  (core/data) and `size-limits.ts` (core/edit) share the 1 x 1 default.
- **The registry compares `min` with `max` using the default minimum when `min` is
  missing**, so a type declaring only `max: { width: 0.5, ... }` is rejected
  (`malformed-record`) instead of being silently widened later.
- **Size-limit layers replace whole bounds**: a type or hook result that gives `min`
  replaces the whole `min` size (both axes); `max` likewise. `SizeLimits.min` and `max`
  are full `Size` values, so there is no per-axis partial bound.
- **`CommandEnvironment.sizeLimits` is the host hook** (`SizeLimitPolicy`), optional;
  `createCommandApi` resolves it into `PlanContext.sizeLimits(node)`.
- **"Externally applied sizes"** is evidenced with a local adapter that carries the
  capability validator and receives an `origin: "external"` patch: the facade has no
  external-origin submit.
- **Task 1.4's command assertion landed with task 2.1** (the `resizeNode` command did not
  exist yet), so 1.4 is ticked in the group 2 commit.
- **`MirrorAxis`** is a named type exported from `node-frame.ts` (`"horizontal" | "vertical"`), and
  `mirroredRotation(rotation, axis)` in `core/data/model/node-frame.ts` holds the D5 table so the
  planner and the capability rule (D4) use the same arithmetic. A mirror whose rotation
  does not change emits only the `mirrored` field, so `r = 0` and `r = 2` horizontal
  mirrors keep their old patches exactly.
- **No existing test mirrored a node at an odd quarter turn** expecting only `mirrored`
  to change; `geometry-scene.test.ts` mirrors an unrotated node and compares against a
  fresh projection, so nothing needed updating (task 2.2 review).
- **`resizeNode` copies the size** into the patch (`{ width, height }`) so extra fields on
  a caller's object never reach the record.
- **`coveredFields(node, fields)`** (compound-fields.ts) returns the fields whose own
  action is replaced, and the validator skips those in `FIELD_ACTIONS`. The local frame
  for the resize rule is the node's current rotation and mirror flag. The tolerance is
  `1e-9 · max(1, |coordinates|, |size change|)` so far-away nodes do not fail on float
  subtraction.
- **The `project` test lives in a new `geometry-scene-project.test.ts`**, not in
  `geometry-scene.test.ts`, which is already 376 lines. `project` counts no node rebuild.
- **Extra core exports**: `DEFAULT_SIZE_LIMITS` (the view's default for models without
  `sizeLimits`), `MirrorAxis` and `NodePlacementChange`, besides the five task 3.5 names.
- **Handle source logic lives in the painter file** (`resizeHandleEntry`), fed by plain
  closures (`target`, `resizable`, `preview`), because view/render may not import the
  selection model in view/interact. The mount wiring supplies the closures.
- **`ghost-entries.ts`** also owns `previewedEntityIds` (the hidden set for move and
  resize previews); `movedEntityIds` in the move painter was folded into it.
- **The resize preview paints at full opacity** (the move preview's ghosts use 0.75):
  the node being resized is not left behind anywhere, so a faded copy would only look
  disabled.
- **Resize gesture order** (D7 lists the pieces, not their order): raw local delta, then
  grid snapping of the moving corner, then the aspect ratio, then the limits. Snapping
  before the ratio keeps every Shift preview exactly at the ratio (the scenario), and
  clamping last keeps every commit inside the limits.
- **The resize probe tries four one-unit trials** (wider, narrower, taller, shorter), each
  clamped into the limits, and uses the first that differs from the current size. So a
  node fixed on one axis only still resizes on the other, and a loaded node outside its
  limits is probed with a size inside them. No differing trial means `out-of-range`.
- **`ToolContextDeps.sizeLimits`** takes the model's lookup; `sizeLimitsOf(model)` reads
  it structurally, since `EditableModel` does not include it (host models may lack it).
- **`outcomeOf` moved from `builtin-commands.ts` to `command-registry.ts`**, so
  `transform-commands.ts` can use it without an import cycle (builtin registers the
  transform commands). Bad arguments to nodes.rotate / nodes.mirror are unavailable with
  `invalid-shape`.
- **Auto-pan arming starts at the press, not at the first auto-panning move.** The
  driver's `update` takes every routed `ToolInput`: a pointer-down records the arming
  start, pointer-moves update the arm and are remembered for replay, and anything that
  leaves the router without an active pointer resets it. Arming at the first dragging
  move would wrongly hold back a fast flick from the middle of the view to the edge.
  Other inputs during a gesture (a wheel zoom) keep the last move, so panning goes on.
- **The first frame after a start integrates 1/60 s**; later frames use the clock time
  difference, capped at 50 ms. The replayed move carries the frame time as `time`.
- **Arming per D10**: armed once the pointer is outside every band, or deeper toward an
  edge than at the press (including entering the band of another edge).
- **The tool harness gained `applyViewport(op)`** so the driver test can pan the
  harness viewport the way the view's viewport state does.
