## Why

A pre-publish audit of the browser view found defects that should be fixed before the first
npm release. In rendering: one throwing painter leaves the scene canvas clipped for good, the
asset cache thrashes when the visible pictures exceed its budget, one SVG that declares a huge
size poisons that budget, every container resize shows a blank frame, and several per-frame
costs grow faster than they need to. In interaction: a lost pointer-up leaves a drag running,
undo or a host edit during a drag is silently overwritten on release, Control-wheel and
trackpad pinch fall through to the browser's page zoom, two-finger trackpad scrolling cannot
pan, touch has no pinch zoom, shortcuts break on non-Latin keyboard layouts, and the root has
no accessible role or name.

## What Changes

Rendering and platform (`src/view/platform`, `src/view/render`):

- Painter calls are isolated: state is restored after a throwing painter, the error is reported
  through a `paint-error` view event, the rest of the frame still paints, and each layer starts
  from a reset context.
- The asset cache keeps what the current frame draws, keeps an asset's decoded source when its
  last bitmap is evicted, evicts whole assets only when they were not drawn in the current
  frame, and reports when the visible set alone exceeds the budget instead of thrashing.
- SVG declared sizes are clamped, SVG sources count by text length, rasters never exceed the
  maximum side, SVG blobs are recognized by media-type prefix, and a failed rasterization drops
  the asset's other cached sizes. A ready asset can be invalidated.
- A resize paints synchronously, the backing store follows the device-pixel box and is capped
  in area, grid lines snap in device pixels, the text-fit result is cached per title, port
  glyphs look up their port directly, and the cheap per-entity allocations go.
- Hover changes repaint the scene only for node painters that ask for it.
- Exported constants are frozen, and every change subscription is per call, so subscribing one
  handler twice needs two unsubscribes.

Interaction and mount (`src/view/interact`, mount files):

- Pointer input carries the held buttons; a move of the active mouse pointer with its button no
  longer held cancels the gesture, and a `contextmenu` event cancels a press that has not
  started dragging.
- A change from any origin (undo, redo, a host edit) to an entity a running gesture involves
  cancels the gesture.
- Control-wheel over the canvas always zooms and is always consumed; a new `wheel: "pan"`
  option pans on a plain wheel in both directions and zooms on pinch; two touches pinch-zoom.
- Shortcuts fall back to the physical key when the produced character is not an ASCII letter
  or digit; a held nudge, rotate, mirror or duplicate key acts once per press.
- Idle pointer moves update the cursor at most once per frame.
- The root gets a role and an accessible name.
- The tool-writing contract moves to `view/advanced` and pointer tool input gets a `buttons`
  field.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `canvas-view`: added "Painter failures stay contained", "Painter errors are reported", "Asset
  cache keeps the visible set", "Over-budget visible set is reported", "Asset invalidation", "Resize without a blank frame", "Device-pixel backing store",
  "Grid lines on device pixels" and "Hover repaint on request".
- `safety-lifecycle`: added "Bounded SVG intrinsic size", "SVG blobs screened by media-type
  prefix", "Immutable exported constants" and "Independent change subscriptions".
- `performance`: added "Cached text fitting", "Direct port lookup while painting" and
  "Throttled idle pointer work".
- `interaction`: added "Lost pointer release", "Gestures yield to any change of their
  entities", "Control-wheel zoom over the canvas", "Trackpad pan mode", "Touch pinch zoom",
  "Shortcuts on non-Latin layouts", "One step per held key", "Accessible root" and "Tool
  contract on the advanced entry".

## Impact

- Source under `src/view` only; no core or React change.
- Public API: a `paint-error` view event, `view.assets.invalidate`, `AssetStats.overBudget` and
  `pinnedBytes`, `NodePainter.repaintOnHover`, `KeyBinding.repeat`,
  `ToolOptions.wheel: "pan"` and `pinchSensitivity`, wheel input fields `deltaX` and `pinch`,
  pointer input field `buttons`, cancel reasons `button-released`, `entity-changed` and
  `pinch`. Tool-writing names move from `view` to `view/advanced` (breaking; there are no
  consumers yet).
- Docs: `docs/guide-view.md`, `docs/interaction.md`, `docs/architecture.md` where they describe
  the changed behaviour.

## Out of Scope

- Keyboard navigation between nodes, starting a connection from the keyboard and screen-reader
  descriptions of the graph (recommended follow-up change, see `notes.md`).
- A Safari-specific clipboard fallback: the browser tests run in Chrome only, so a fallback
  could not be verified (see `notes.md`).
- Field-level filtering of which changes cancel a gesture, and merging repeated nudges into one
  history entry (both would need core support).
- Everything under `src/core` and `src/react`.
