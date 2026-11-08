# Implementation notes

## Wheel over the overlay (task 4.3)

The first run of the wheel tests passed without a change to the overlay layer. The input
adapter already ignores a wheel whose target is host content inside the overlay layer, so
the page or the content scrolls and the canvas does not zoom. A wheel whose target is the
overlay layer itself (the empty part) is routed to the viewport and zooms. Both cases are
covered by `src/view/overlay-wheel.browser.test.ts`.
