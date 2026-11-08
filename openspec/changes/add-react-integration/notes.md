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

### Selection snapshot (review finding 7)

`useSelection` returned the view's internal selection keys (`"n:<id>"`), and the example
inspector parsed the prefix. The hook now returns `{ nodes, connections, primary }` with
real IDs, and `primary` carries its kind (`{ kind: "node" | "connection", id }`). The key
encoding stays private to the view.
