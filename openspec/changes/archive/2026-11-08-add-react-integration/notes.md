# Implementation notes

## Wheel over the overlay (task 4.3)

The first run of the wheel tests passed without a change to the overlay layer. The input
adapter already ignores a wheel whose target is host content inside the overlay layer, so
the page or the content scrolls and the canvas does not zoom. A wheel whose target is the
overlay layer itself (the empty part) is routed to the viewport and zooms. Both cases are
covered by `src/view/overlay-wheel.browser.test.ts`.

## Review fixes

An architectural review after the first implementation found several defects in the
mount component and hooks. Each fix has its own commit and regression test.

### The lock prop (review finding 1)

`locked` was accepted as a view option but neither applied after mount nor a remount key,
so only its first value counted. The component now applies it whenever it changes and
reports changes through `onLockedChange`. The remount list was a hand-kept array; it is
now derived from a total map over the view's option keys.

### Initial options and zoom limits (review finding 2)

`initialViewport`, `initialFit` and `zoomLimits` were remount keys, so an inline
`initialFit={{ paddingPx: 20 }}` threw away the view on every parent render. The first two
are now read once at mount. Zoom limits got a runtime setter on the view
(`setZoomLimits`, `zoomLimits()`) and the prop is live, compared by value. In development
a warning fires once when the view remounts on three consecutive renders.

### Theme and tool options replace (review finding 3)

`view.setTheme` and `view.setToolOptions` merge, so a `theme` prop that later dropped a key
(or became `undefined`) never went back to the default. Both view calls take
`{ replace: true }`, which applies the patch to the defaults as at mount, and the React
component uses it. Imperative calls keep merging.

### Command hooks (review finding 4)

`useCommandAvailability` ignored the lock, so a toolbar button stayed enabled after the
view was locked and its click was refused without feedback. The hook now also listens to
the lock. It also wrote a ref during render; the id and arguments are now plain
dependencies. `useCommand(id, args)` returns availability, reason and `run` together,
which is what every toolbar button builds by hand; the example toolbar uses it.

### Children, onReady and the shared slot (review finding 5)

Without a provider, `ViewControls` and `NodeOverlay` rendered nothing and the handle could
not be reached. `NodeEditor` now accepts children (inside its own store) and an `onReady`
callback. When one editor unmounted it cleared the slot even if another editor had taken
it; the cleanup now clears only its own view, and a development warning says when a second
editor mounts into a provider that already has one. Several editors in one provider still
share one slot (the newest wins); the guide tells hosts to use one provider per editor.

### Node overlay notification (review finding 6)

`NodeOverlay` took "the editor has no model" for "the node was removed" and called
`onNodeGone` when the editor merely unmounted or its model was replaced. It now watches one
(model, node) pair and reports only a removal from the model being shown. The callback lost
its reason argument: the type had a single value, so it carried nothing; `NodeGoneReason`
is gone from the public API.

### History guard and dispatcher lifetime (review finding 11)

`useHistory` repeated the model check with a cast; the view now exports a `hasHistory`
type guard and the hook uses it. The per-model entity dispatcher was created, and the
previous one disposed, inside a `useMemo` while rendering. That is a side effect in render:
a render that React discards could dispose the dispatcher the live tree depends on. The
store now creates and disposes the dispatcher when the model in the slot changes.

A second audit found that this disposed the dispatcher too early. A remount that keeps the
model (a new geometry registry, say) clears the slot and sets it again in the same effect
flush, so the hooks saw the same model, kept the subscription to the disposed dispatcher
and never woke again. The dispatcher now belongs to the model, not to the view: it
survives the empty slot and is replaced only when a different model arrives. It listens to
the model only while a hook is subscribed, so keeping it holds nothing open.

### Selection snapshot (review finding 7)

`useSelection` returned the view's internal selection keys (`"n:<id>"`), and the example
inspector parsed the prefix. The hook now returns `{ nodes, connections, primary }` with
real IDs, and `primary` carries its kind (`{ kind: "node" | "connection", id }`). The key
encoding stays private to the view.

### One event channel and a generic hook (review finding 8)

Subscriptions came in three shapes (`viewport.on`, `selection.on`, `view.on`), so every hook
wrote its own subscribe-and-read pair and a host could not follow new state. The viewport
and selection now raise `"viewport"` and `"selection"` through `view.on`, the old methods
are removed, and `useEditorState(read, events, { fallback, isEqual })` is exported; the
selection, viewport, hover and lock hooks are built on it. The context-menu event is not
allowed in the hook, because any listener suppresses the browser's own menu.

Readers stay as they are (`viewport.get()`, `hover.get()`, the `locked` property,
`theme()`, `toolOptions()`, `zoomLimits()`): each reads one thing, the hook takes the reader
as a function, and renaming public readers would touch the lock and hover requirements for
no gain.

### Lock gating (review finding 10)

The final `commit` wrapper refused edits while locked, which duplicated `can` and `plan`.
It guarded one real path: a connection choice opened before the lock and answered after
it. Locking now cancels the pending choice (a test proves a late answer commits nothing),
and the wrapper is gone. The registry, `can`, `plan`, the route-editor lookup and the
clipboard service's direct methods stay, each guarding a path the others do not reach.
The command flag `viewOnly` is now `allowWhenLocked`, which says what it does.

### Node rectangle and placement set (review notes)

`nodeRect` returned `{ x, y, width, height }`, but a popover library takes a virtual
reference whose `getBoundingClientRect()` also has `top`, `left`, `right` and `bottom`; the
docs claimed it worked directly. `ViewRect` now carries all eight fields (also in the hover
event). `OverlayPlacement` had `top-left` but no other corner. It is now the full set of
nine: four edges and the centre, and four corners. Edges sit the element outside the body
and corners pin the element's same corner to the node's corner, which keeps the existing
default (`top-left`, the element hanging from the node's corner) unchanged.

### Controls panel (review finding 9)

The zoom buttons called `viewport.zoomAt` themselves, so the zoom had no command for
shortcuts or menus, and the buttons did not disable at the zoom limits. `view.zoomIn` and
`view.zoomOut` are now view commands (a factor argument, unavailable at the limit, allowed
while locked), the buttons use them through `useCommand`, and `useCommandAvailability` also
follows the viewport event, because these commands depend on the zoom. The lock glyph was an
emoji that looks different on every platform and did not change between states; all four
icons are inline SVG, the lock icon follows the state, and `icons` replaces any of them.
`ViewControls` takes children, and `ControlsButton` is exported as a component for hosts to
add buttons; the former type of that name is now `ControlsButtonName`.

### Availability triggers (second audit)

`useCommandAvailability` followed selection, model, history, lock and viewport changes
only. Three other things change what a command can do: copying fills the clipboard buffer
(paste turns on), a command registered after mount appears, and new zoom limits can turn
zoom in or out off without moving the zoom. None raised an event, so a button stayed stale
until something else happened. The view now raises one `"availability"` event for those
three causes and the hook listens to it.

### The generic hook and object results (second audit)

`useEditorState` defaulted `isEqual` to `Object.is` while documenting that `read` may be
inline. A `read` returning an object then produced a new snapshot on every call, which
React reports as "getSnapshot should be cached" and ends with "Maximum update depth
exceeded". The default is now a shallow comparison. The subscription also depends on the
event names, so an inline `events` array no longer resubscribes. The hook's comment no
longer promises to follow "a custom tool's state": no event exists for that, so a host
follows only what the view's events announce.

### Hover over overlay content (second audit)

The pointer-move handler fed the hover tracker for any target, including host content in
the overlay layer. A node behind a popover or behind the controls panel was therefore
hovered while the pointer was on the host's own element, and a popover anchored to node A
jumped to node B when the pointer entered it over B. Moves whose target is overlay content
are now ignored by the tracker. The alternative, ending the hover on entering the content,
would close a popover the moment the pointer reaches it.

### The lock prop is controlled when given (second audit)

The first fix applied `locked` only when the prop changed, so with `locked={true}` and an
`onLockedChange` that ignored the change the lock button still unlocked the view, and
after a remount the new view took the prop (possibly unset, so unlocked) without telling
a host that only listened. The guide's "fully under the host's control" overstated it.
Now, with a `locked` prop, a change that does not match the prop is reported to
`onLockedChange` as an attempt and the view is put back at the prop at once; a change that
matches it (the prop's own) is not reported. Without the prop the view owns the flag,
reports every change, and a remount carries the state over.

### The selection handle names entities (second audit)

The hook returned IDs, but `view.selection` and the `"selection"` event still spoke in the
view's internal key strings (`"n:a"`), so a host that set the selection or listened to the
event had to know the encoding. `view.selection` is now a `ViewSelection`: `nodes()`,
`connections()`, `primary()`, `state()`, `has`, `isSelected`, and `replace`, `add`,
`toggle` and `clear` over `{ kind, id }` entities. The event carries `state()`.
`SelectedEntity` and `SelectionState` come from the view entry point and the hook returns
the same `SelectionState`; the react entry point no longer exports its own copies, because
a name has one entry point. The tools and the internal selection model still use keys, and
`SelectionKey`, `nodeKey` and `connectionKey` stay exported for people writing tools.

Hover targets keep their own shape (`{ kind: "node", node }`, plus a port form with both
the node and the port and a connection form with an optional member) instead of the
selection's `{ kind, id }`. A hover target can name a port and a composite member, which a
selection cannot, so one shape would need optional fields on every variant; the two are
different things and the saving is small.

### One table of built-in command IDs (second audit)

The view entry point exported both `COMMAND_IDS` and `VIEW_COMMAND_IDS`. The second held
four IDs that the first repeated, lacked the zoom commands, and nothing used it. It is
removed; `COMMAND_IDS` is the table.

### Live-prop robustness (second audit)

Three smaller defects. An inline `theme` or `input.toolOptions` object was compared by
identity, so it repainted the background and scene on every parent render; both are now
compared by value (plain data entry by entry, functions by identity). A `zoomLimits` prop
with `min` above `max` made the view throw from an effect, which unmounts the tree through
the nearest error boundary; the component now warns in development and ignores it (at
mount the absolute bounds apply, on a live view the previous limits stay). And
`view.setLocked(false)` cancelled a pan or marquee in progress along with editing
gestures; only locking cancels a gesture now, as the requirement says.

### Test gaps closed and left (second audit)

Closed: the "and not otherwise" half of the host-defined state scenario (a pan and a
reordered selection of the same size do not re-render), the history guard test now carries
the requirement it proves, the lock callback is tested through the button, the prop, the
API and a remount, a trackpad pinch (a wheel with the control key) is held to the zoom
limits, and locking leaves no history entry, revision change or snapshot trace.

Left, on purpose: two-finger touch pinch is not implemented by the view at all (only the
trackpad form that browsers deliver as a control-key wheel is), so there is nothing to
test; "lock never relaxes permissions" is true by construction, since the view reaches the
model only through the command API that checks permissions; and "hover never uses pixel
lookups" cannot be observed from outside, so it rests on the hover tracker's tests, which
only pass a geometric picker.

### Documentation catch-up (second audit)

The lock was documented only in the React guide. The view guide now has the missing mount
options (`routes`, `routeEditors`, `zoomLimits`, `initialFit`, `locked`) and a section on
the view lock with the `"lock"` event and `allowWhenLocked`; the interaction notes have a
short section on what a locked view refuses. Stale statements fixed: the design no longer
says history hooks need `EditableModel` or that hover runs on the existing scheduler,
lists every availability trigger, defines a gesture as a pointer-captured one (a wheel turn
is not one), and says a change of hover always repaints the scene; the canvas-view spec
and proposal use the real placement names (`top`, not `above`).
