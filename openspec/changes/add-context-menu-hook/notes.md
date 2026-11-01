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
- **`view-context-menu.ts` is thin**: it owns the emitter and attaches
  `context-menu-input.ts` once `view-editing.ts` has the DOM input; `view.on` works
  without input (the event then never fires).
- **A native `contextmenu` from a touch never raises an event by itself**: touch menus
  come only from the long-press machine, so `longPressMs: false` also silences Chrome
  Android's own long-touch `contextmenu` (it is default-prevented while a listener
  exists, like every other native menu).
- **During a drag past its threshold the native menu is suppressed too** (with a
  listener), as D4 says; only the event is skipped.
- **Keyboard placement uses the view's CSS size** for the visible world rectangle, and
  the client position is the root's bounding rect plus the viewport point.
- **`contextMenu` and `touch` test helpers live in `input-test-support.ts`**, so the
  browser tests split into `context-menu.browser.test.ts` (pointer, scoping, commands,
  dispose) and `context-menu-keys.browser.test.ts` (keyboard, touch), each under 300
  lines.

## Browser observations (Chrome, synthesized events)

- Chrome's `contextmenu` is a `PointerEvent` with `pointerId` and `pointerType`, so the
  touch dedupe can match the armed pointer; synthesized `MouseEvent`s fall back to
  `mouse`.
- A touch drag test maps each move through the already panned view, so the pan it sees
  is larger than the finger travel; the test checks a lower bound.

## Demo check (task 5.1)

`npm run demo:build`, then `vite preview` on a spare port and a headless Playwright run in
the installed Chrome (`channel: "chrome"`, script kept out of the repo):

- right-click on the pump: Cut, Copy, Paste here (disabled, empty buffer), Duplicate,
  Delete, Rotate, Mirror, Select all, Fit all, Undo, Redo (disabled);
- Delete from the menu removed the pump (a right-click there then shows the canvas
  items), Escape closed the menu, Ctrl/Cmd+Z brought the pump back;
- Copy from the menu, then "Paste here" on empty canvas: a right-click at that point hits
  the pasted node;
- Shift+F10 with the pump selected opened the menu at the pump's centre; Escape closed it
  and focus returned to the editor root;
- no console errors.
- The demo's global `P`/`G`/`E` keys now ignore key presses inside the overlay (the
  menu), so they do not fire while a menu item has focus.

## Gate results (task 6.1)

- `npm run lint`: 436 files, no findings.
- `npm run typecheck`: all four passes clean (including the core-only pass).
- `npm test`: 110 files, 650 tests passed (`src/architecture.test.ts` included).
- `npm run test:browser` (installed Google Chrome): 35 files, 166 tests passed.
- `npm run build`: ok.
- `npm run bench:size` (gzip): core 30.8 KiB (budget 75), view 40.8 KiB (budget 150),
  advanced 26.0 KiB, react 40.8 KiB. All budgets met.
- Files over 300 lines among those changed: only `src/view/mount-view.ts` (337, the
  accepted exception). `context-menu-input.ts` is the largest new file at 290.

## Size

Measured with `git diff --numstat` from the split commit `cd780b5` to the end of this
change, and gzip sizes from `scripts/bundle-size.mjs` (exact bytes) at both commits.

| Part | Library code | Test code | Example |
| --- | --- | --- | --- |
| Context menu (this change) | +820 / -50 lines | +749 / -1 lines | +120 lines |

The library figure includes the `key-input.ts` refactor (33 lines moved out of
`dom-input.ts`). Bundle (gzip): view 39,915 -> 41,829 bytes (+1,914, about +1.9 KiB),
advanced 24,871 -> 26,578 bytes (+1,707), core unchanged (31,582).

## Documentation (group 7)

- `docs/interaction.md` gains section 7a (context menu) with the flow diagram, the
  scoping bullet for overlay keys, the `"context-menu"` cancel source and `longPressMs`.
- `docs/guide-view.md` covers `view.on("context-menu")`, building a menu from
  `commands.list()` and `availability`, `edit.paste` with `at`, the `viewport` anchor and
  overlay keys.
- `docs/architecture.md` places the context-menu input beside the DOM input adapter with
  a diagram, and updates the code map and layer diagram.
- Every Mermaid block in `interaction.md` and `architecture.md` renders (mermaid 11 in
  headless Chrome).
