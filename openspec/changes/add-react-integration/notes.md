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
