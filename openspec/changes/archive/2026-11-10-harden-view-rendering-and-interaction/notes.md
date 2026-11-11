# Notes

Evidence and findings recorded while implementing. Results of the final gates are at the end.

## Base

The worktree started behind `main`; it was fast-forwarded to `main` at "Retire the
requirement-code notation" before the change was planned. No file under `src/core` or
`src/react` was changed.

## Findings that reproduced (test first, then the fix)

Each failing test was run before its fix and failed at the asserted rule:

- Painter isolation: the clipping-and-throwing painter test left the other node unpainted
  (pixel 0 instead of 255); the frame-scheduler tests stopped at the throwing layer.
- Resize: with a frame clock that never fires, the background canvas read blank (0) after a
  resize; it reads the theme colour with the synchronous flush.
- Grid: at ratio 1.5 line device coordinates had a fraction of 0, not 0.5.
- Failed rasterization: one size stayed cached (`cacheEntries` 1) after another failed.
- Asset thrash: the eight-picture scenario first ran with a one-frame pin and still made 484
  resolver calls in 120 frames (a decode finishing after the frame that asked for it released
  the asset again); pinning the last two frames brings it to eight resolves and eight
  rasterizations (design D2).
- Text fitting: 500 distinct truncated titles made 3001 measurements on a repeated frame.
- Port lookup: painting a 200-port node asked for the port list once and searched it per
  anchor; now it makes 200 direct reads and no list.
- Hover: a hover change between two nodes repainted the scene with no painter using it.
- Constants: the walk over the view entries found unfrozen constants, among them the default
  theme and its override tables, the keymap and each binding, the tool options, the built-in
  tools and the fallback painters.
- Subscriptions: one handler subscribed twice lost both subscriptions on one unsubscribe in
  the painter registry, background slot, route editor registry, asset service and selection.
- Lost release: Control-click without a menu listener, then moves, moved the node to
  (200, 160).
- Undo during a drag: undoing a moved node during a second drag let the release overwrite the
  undo.
- Control-wheel at the maximum zoom was not default-prevented.
- Non-Latin layouts: Ctrl with the physical Z key producing "я" resolved to nothing.
- Key repeat: ten repeated ArrowRight key-downs moved the node 11 units.

## Findings fixed without a reproducing scenario of their own

These were "read only" in the audit; the tests added prove the new rule rather than a failure
seen in the field: device-pixel backing size and the area cap (pure calculation), SVG
intrinsic clamp and source counting, media-type prefix (an `image/svg+xml;charset=utf-8` blob
with a script skipped the screen and went to raster decoding before; the new test shows it
now fails as unsafe), animated
links, idle cursor throttling, touch pinch, the trackpad pan mode, the accessible root, the
tool contract placement, allocations.

`IMAGE/SVG+XML` in upper case already worked before the fix: `Blob` lower-cases its type.

## Decisions taken during implementation (also in design.md)

- No `label` mount option for the accessible name: adding a view option requires a matching
  entry in the React wrapper's option table (`src/react/node-editor-props.ts`), which this
  change does not touch. The host sets `aria-label` on `view.element`. Follow-up: add
  `ViewOptions.label` together with a one-line `label: "remount"` (or live) entry there.
- A pending connection choice that waits for a host verdict still cancels only on an external
  change or a removal of its ports, not on local edits: a choice commits a new connection and
  overwrites nothing, so the rule for gestures (design D12) is not needed there.
- The shipped fallback painters are frozen, so tests can no longer spy on them; the painter
  registry test now registers counting painters instead.
- The browser test helpers now send DOM `buttons` on every pointer event, as real browsers do,
  and the benchmark workload's middle-button mask was corrected from 2 to 4 (the DOM bit of the
  middle button).

## Safari clipboard (not changed, unverified)

The audit's concern: keyboard copy, cut and paste run only from the browser's native `copy`,
`cut` and `paste` events, and WebKit is generally said to fire those only when there is a text
selection or the focused element is editable. The view root is a focusable, non-editable
`div` with no selection.

What could not be verified here:

- Whether Safari (current or previous stable, macOS and iOS) fires `copy`, `cut` and `paste`
  on the document for Cmd+C, Cmd+X and Cmd+V while focus is on the view root with no selection.
- Whether Safari enables Edit > Copy/Paste for that focus, which decides whether the menu items
  work too.
- Whether a workaround (a hidden, focused `textarea` or a temporary selection created on
  key-down so the native event fires) behaves in Safari without side effects such as scrolling,
  the iOS keyboard opening, or the paste permission bubble.

Why: the browser tests run in the installed Google Chrome only (`vitest.config.ts`); no WebKit
build is installed for Playwright, and the project does not download browsers. `safaridriver`
exists on this machine, but the project has no WebDriver provider for Vitest, and the planned
Safari opt-in has not been set up. Adding a fallback that cannot be tested here could make one
shortcut run two commands (the native event and the fallback) in browsers where both happen.

What works regardless: `view.clipboard` (`copy()`, `paste()`, `pasteFromSystem()`,
`exportText`, `importText`) for toolbar and menu buttons, and Mod+D (duplicate), which does
not use the clipboard.

Recommended follow-up: a manual check in Safari with the demo (focus the canvas, select two
nodes, Cmd+C, Cmd+V), and, if the events do not fire, a hidden-textarea fallback behind the
same "event alone runs the command" rule, verified with Safari through `safaridriver`.

## Recommended follow-up change: keyboard access to the graph

Out of scope here (the root now has a role and a name). A later change should cover:

- Moving focus between nodes with the keyboard (Tab or arrow keys in a navigation mode
  distinct from nudging), with a visible focus ring drawn on the interaction layer.
- Announcing the focused node (type, title, diagnostics) and the selection through a live
  region in the overlay, without per-node DOM.
- Starting and finishing a connection from the keyboard (port focus, then a target port).
- A documented keyboard map for these actions and a check with a screen reader.

The settled decisions in `openspec/config.yaml` reduce accessibility to shortcuts for select,
move, delete and undo and exclude screen-reader parity, so such a change needs the owner's
decision first.

## Other follow-ups noticed

- `dom-input.ts` is 345 lines after this change (331 before); its contracts moved to
  `dom-input-types.ts` and the idle cursor and pinch went to their own modules, but a further
  split (press tracking, blur and visibility handling) would bring it under 300.
- `asset-service.ts` is 319 lines; its public types moved to `asset-types.ts`.
- Pinch sensitivity (0.01 with a ±10 clamp per event) and the trackpad pan mode were checked
  with synthetic events only, not on a physical trackpad.
- Field-level filtering of which changes cancel a gesture (so live status updates do not cancel
  a drag) needs tools to declare the fields they write and core to report changed fields.

## Gates

Run on the final commit of this change:

- `npm run lint`: passes (621 files, no findings).
- `npm run typecheck`: passes (project, core-only, examples, bench).
- `npm test`: 158 files, 1027 tests pass (976 at the start of the change). The architecture
  test passes.
- `npm run test:browser`: 66 files, 344 tests pass (321 at the start).
- `npm run build`: passes with no warnings.
- `openspec validate harden-view-rendering-and-interaction --strict`: valid, exit 0.
- `git merge-tree` against the current `main` (which moved on with the other audit changes)
  reports no conflict.
