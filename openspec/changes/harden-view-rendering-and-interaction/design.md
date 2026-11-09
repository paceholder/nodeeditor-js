# Design

## Context

The audit reviewed `src/view` and reported each finding as reproduced or read only. This change
fixes the findings in the view layers. Each fix starts with a test that fails before it. Where a
fix has a trade-off, the conservative option was taken and is recorded here for the owner.

## Decisions

### D1 Painter isolation

Every painter call in the scene layer (node, connection, port glyph) and every interaction-layer
painter runs inside `try`/`finally`: the `save()` before it is always matched by a `restore()`.
Port glyphs keep running without a save per glyph (the existing cost decision); after a glyph
throws, the layer restores its one saved state and saves it again, so a clip the glyph set does
not reach the next glyph. Node selection and diagnostic badges are still drawn for a node whose
painter threw.

The frame scheduler guards each layer and the after-frame hook separately, so one failure does
not skip the rest of the frame.

Every layer paint starts from a reset context: `ctx.reset()` where the browser has it. Where it
does not, the backing store is reassigned (`canvas.width = canvas.width`), which also resets the
state, but only after an error was caught on that layer, because reassigning reallocates the
store. This backstop also covers a painter that leaves an unbalanced `save()` without throwing.

Errors are reported through a new `paint-error` view event (`{ layer, error }`), at most once per
layer per frame. With no listener the error is rethrown in a microtask, the same as an error in
a view event handler, so it still reaches the console and error monitoring.

Rejected: swallowing errors silently (hides host bugs); disabling a painter after it throws (a
transient failure would hide a node for good); a save per port glyph (the cost the glyph path
was designed to avoid).

### D2 Asset cache eviction model

- A bitmap drawn or stored since the last painted frame is pinned: eviction never removes it. The
  view tells the asset service a frame ended (`endFrame()`, called after every painted frame).
- Evicting an asset's last bitmap no longer forgets the asset. Its decoded source stays and is
  counted, so the next draw rasterizes again without calling the host resolver.
- When the cache is still over budget after evicting unpinned bitmaps, whole assets that were not
  drawn in the current frame and have nothing rendering are released, least recently drawn first.
  Only those call the resolver again when drawn later, and they are not visible.
- When the pinned set alone exceeds the budget, the cache stays over budget instead of evicting
  what the frame needs. `stats().overBudget` is true while that holds and `stats().pinnedBytes`
  tells how much the frame needs, so a host can raise the budget.

The budget default (64 MiB) is unchanged. Rejected: a diagnostic entry for an over-budget frame,
because `diagnostics()` lists asset failures that `status()` also reports as `failed`, and being
over budget is neither a failure nor tied to one asset; evicting visible bitmaps anyway (the
reported thrash); keeping every resolved source text or blob so that no resolver call is ever
repeated (memory held for assets that may never be drawn again).

A standalone user of `createAssetService` must call `endFrame()` after each frame; without it
every bitmap stays pinned. This is documented on the method.

### D3 SVG size and accounting

An SVG's intrinsic size comes from its `width` and `height` attributes, else its `viewBox`, as
before, and is now scaled down, keeping the aspect ratio, so its longer side is at most 4096
(`MAX_RASTER_SIDE`). An SVG source counts its text length times two bytes against the budget,
not width times height times four, because the decoded form is an image element whose memory
is the browser's. A raster source still counts width times height times four. `rasterSize`
scales any bucket down to fit `MAX_RASTER_SIDE`, so a large raster blob cannot ask for a larger
bitmap.

A blob is screened as SVG when its media type starts with `image/svg+xml` (ignoring case), so
`image/svg+xml;charset=utf-8` is screened too. The screen also rejects `<set>` and `<animate>`
elements that target `href`. The real isolation is that SVG is decoded through an image element:
browsers run no script and fetch nothing for SVG used as an image. The screen is a second layer.
The module comment and the guide say so.

### D4 Resize without a blank frame

Resizing a canvas clears it. The resize-observer callback now marks every layer dirty and
flushes the frame scheduler at once (a new `flush()`), painting before the browser presents the
frame. Resize observers run after layout and before paint, so the cleared canvas is never shown.
Rejected: keeping a copy of the old frame and drawing it scaled (it costs memory and still shows
a wrong frame).

### D5 Backing store from the device-pixel box, with an area cap

Where the resize observer reports `devicePixelContentBoxSize`, the backing store takes that exact
device-pixel size; elsewhere it stays CSS size times the pixel ratio, rounded. The backing area
of each canvas is capped at 16 777 216 pixels (4096 × 4096), the per-canvas limit of iOS Safari,
beyond which a canvas is silently blank there. Above the cap the effective pixel ratio is scaled
down so the area fits, and painting uses that effective ratio. The calculation is a pure
function in `platform/dom/backing-size.ts`.

### D6 Grid lines snap in device space

A grid line's position is rounded in device pixels and placed on the device pixel's center
(`(round(x * dpr) + 0.5) / dpr` in CSS units), so one-device-pixel lines stay crisp at
fractional ratios such as 1.25 or 1.5.

### D7 Hover repaint on request

No built-in painter draws hover, yet every hover change repainted the whole scene. A node painter
may now declare `repaintOnHover: true`; a hover change repaints the scene only when the node
leaving or entering hover is painted by such a painter. `state.hovered` stays correct whenever
the scene paints. Hosts that want hover feedback without a scene repaint draw it on the
interaction layer from the `hover` event. Rejected: drawing a built-in hover outline on the
interaction layer (a new visual nobody asked for); removing `state.hovered` (breaks painters that
use it).

### D8 Text fitting cache

`fit` results are cached per font, text and width, next to the width cache, in a map bounded the
same way. A steady frame with hundreds of truncated titles makes no `measureText` calls.

### D9 Port painting and allocations

Port glyphs look up each anchor's port with `reader.getPort` instead of `portsOf(...).find`,
which was quadratic per node and allocated a list per node per frame. No core change was needed.
Per-entity allocations that are cheap to avoid go: the style lookup takes type and ID as
arguments, a node's local body bounds are cached per scene entry, and the image-symbol label
computes its corners without arrays.

### D10 Immutable constants and per-call subscriptions

Exported constant objects and arrays of the view entries are frozen deeply (default theme, tool
options, auto-pan, keymap, layer and z-order lists, command ID tables, placement constants,
sentinel results). A test walks the exports. Registry, slot, asset and selection subscriptions
now wrap the handler per call, as view events already do, so two subscriptions of one function
are independent.

### D11 Lost pointer release and the context menu

Pointer tool input gains `buttons`, the bit mask of held buttons as DOM pointer events report it
(1 primary, 2 secondary, 4 middle). It is optional in the type, so hand-built input stays valid;
the DOM adapter always fills it. When a move of the gesture's mouse pointer arrives with the
gesture's button no longer held, the router cancels the gesture with reason `button-released`.
It is a cancel and not a release, because the release position is unknown and committing on a
guess could write an edit the user did not make.

A `contextmenu` event on the root cancels a gesture whose press has not passed the drag threshold
(reason `context-menu`), whether or not a context-menu listener is registered. On macOS a
Control-click opens the native menu and the mouse-up is lost; the press is cancelled before that.

### D12 Gestures yield to any change of their entities

Until now only a removal (any origin) or an external change cancelled a gesture. A change from
undo, redo or a local host edit to an involved entity was overwritten on release, because tools
compute what they write from the gesture's start. Now a change from any origin to an involved
entity cancels the gesture: reason `external-change` for an external change, as before, and the
new `entity-changed` for a local, undo or redo change. The gesture's own commit never cancels it,
because the router has already ended the gesture when its commit runs.

Rejected: refusing editing commands while a gesture runs (it does not cover a host calling the
model directly). Trade-off: a host that streams local changes to the node being dragged (live
status, for example) cancels the drag; field-level filtering would need tools to declare the
fields they write and core to report changed fields, and is left as a follow-up.

### D13 Control-wheel and trackpad pinch

Wheel input gains `pinch`: the event had the Control key, which is also how browsers report a
trackpad pinch (on macOS even though the user holds no key). A pinch zooms in every wheel mode
and is always reported as handled, even at a zoom limit, so the browser never zooms the page
over the canvas. It uses a new `pinchSensitivity` (default 0.01), with each event's delta
clamped to ±10 CSS pixels so a Control-wheel notch on a mouse (deltaY 100) zooms by about 10 %
rather than a factor of e. The values are not checked against a physical trackpad here
(recorded in `notes.md`).

### D14 Trackpad pan mode and horizontal delta

Wheel input gains `deltaX`. The new `wheel: "pan"` mode pans on a plain wheel or two-finger
scroll in both directions and zooms with a pinch or the primary modifier. The default stays
`"zoom"`, where horizontal delta is still ignored, so existing behaviour does not change. Option
name rejected: `"trackpad"` (the mode also suits a mouse with a horizontal wheel).

### D15 Touch pinch zoom

A second touch while one touch is down cancels the running gesture (reason `pinch`) and starts
a pinch: a pure state machine in `interact/input/touch-pinch.ts` turns the two touches into a
`zoomAt` about their midpoint by the ratio of distances and a `panBy` of the midpoint's motion.
The pinch ends when either touch lifts; the remaining touch does nothing until it lifts too.
Zoom limits apply through the viewport state as for every zoom.

### D16 Key-code fallback

When a key event's character is not an ASCII letter or digit and its `code` names a letter or
digit key (`KeyZ`, `Digit1`), the keymap matches the code's character. Latin layouts keep
matching by character, so AZERTY's Z is still where the user sees it.

### D17 One step per held key

`KeyBinding.repeat` (default true) says whether auto-repeated key-downs run the command. The
default keymap sets it to false for nudge, rotate, mirror and duplicate, so holding a key acts
once and adds one history entry. Rejected: a keyboard gesture that previews the accumulated
nudge and commits once on key-up (more machinery than the defect warrants now), and merging
history entries (needs core). Trade-off: holding an arrow key no longer moves continuously.

### D18 Idle pointer throttling

With no gesture running, a mouse move stores its position and the cursor work (a scene pick and
the resize-handle hit test) runs at most once per frame from the view's frame clock. Hover was
already coalesced per frame.

### D19 Accessible root

The root gets `role="application"`, `aria-roledescription="node editor"` and an `aria-label`,
default "Node editor", replaceable with `ViewOptions.label` (localizable, as messages must be).
The canvases are `aria-hidden`. `application` is chosen because the editor handles its own keys
and screen readers should pass them through. Rejected: `region` (screen readers would keep their
own key handling) and `img` (wrong for an interactive surface).

### D20 Tool contract placement

The names needed only to write a tool move to `view/advanced`: `Tool`, `Transition`,
`ToolContext`, `ToolInput`, `ToolEffect`, `PressInfo`, `PointerInput`, `PointerType`,
`Modifiers`, `NO_MODIFIERS`, `ViewportOp`, `CursorKind`, `ChoiceRelease`, `toolSlot`, `wheelZoom`
and the built-in tool factories. `view` keeps what mounting needs: `ToolSlot`,
`defaultToolSlots`, `ToolOptions`, `DEFAULT_TOOL_OPTIONS`, `CancelReason`, the preview types and
the auto-pan options. The contract comment says it may change before 1.0.

### D21 Safari clipboard

Not changed. The browser tests drive Chrome only (no WebKit build is installed and none may be
downloaded), so a Safari fallback could not be verified. `notes.md` records what is unverified.

## Risks

- Hosts whose node painter relies on `state.hovered` must now set `repaintOnHover`.
- Holding an arrow key moves once; hosts that want continuous nudging set `repeat: true` on their
  own bindings.
- Cancelling on local changes cancels drags in hosts that stream local updates to dragged nodes.
