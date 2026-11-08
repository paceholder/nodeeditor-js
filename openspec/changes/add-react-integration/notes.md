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
