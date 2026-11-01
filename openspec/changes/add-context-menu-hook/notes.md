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
- **`createViewEvents<M>()` is generic** over its event map; `ViewEventMap` (only
  `"context-menu"`) lives in `context-menu-types.ts`. It takes an optional error reporter
  (default: rethrow in a microtask), which the tests use. The clipboard events do not
  isolate handlers today, so "as the clipboard events do" in D1 only holds for the
  `on` shape.
- **"Modifiers are ignored" holds by construction**: `selectOnOpen(target, selection)`
  takes no modifiers.
- **The long-press "second-down" input is a `down` with another pointer ID** while
  armed or fired; `cancel` covers pointercancel, blur, hidden and dispose.
- **`clipboard-service.ts` needed no change for `at`**: `service.paste(text, placement)`
  already took an explicit placement, so `edit.paste` turns `at` into
  `{ kind: "center", at }` and the service keeps preferring it over the pointer. The
  repeated-paste counter still advances as for a pointer paste.
- **A `viewport` anchor has no `scale` option**, so the type cannot ask for one.
