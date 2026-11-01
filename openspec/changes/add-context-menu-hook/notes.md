# Implementation notes

Deviations from design.md, clarifications made while implementing, observations and gate
results.

## Deviations and clarifications

- **`dom-input.ts` dropped from 298 to 276 lines** with the key handling moved to
  `input/key-input.ts` (`createKeyInput` returns the two handlers; `dom-input.ts` still
  registers them with its other listeners). Blur keeps its synthetic Space key-up in
  `dom-input.ts`, because it belongs to the cancellation sources.
- **`ClipboardEventsDeps.overlay` is optional**, so `attachClipboardEvents` from
  `view/advanced` keeps working without an overlay; the view passes its overlay layer.
- **Only `keydown` is gated for overlay content.** `keyup` still reaches the router, so a
  Space released over a host menu clears the held-Space state as before.
