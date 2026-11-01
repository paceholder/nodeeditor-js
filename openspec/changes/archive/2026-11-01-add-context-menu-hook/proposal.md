# Proposal

## Why

A host cannot attach a context menu to the editor today. A right press is ignored by
every tool and the browser's own menu opens. The view raises no event saying what was
under the pointer, touch has no long-press, and the keyboard menu key does nothing, even
though UX-01 asks for keyboard access to context actions. Keyboard events from host
controls in the overlay (a menu button) also bubble to the editor root, so Escape in a
host menu clears the selection and Delete deletes it.

The library will not ship menu UI. Hosts have their own design systems, and the usual
JavaScript-library answer is a hook: React Flow's `onNodeContextMenu` /
`onPaneContextMenu`, or Cytoscape's menu as a separate plugin. This change adds that
hook, plus the small gaps a host menu needs: paste at a given position, an overlay anchor
fixed to the screen, and overlay content that runs no graph shortcuts.

Connection choices (a policy offering several connection kinds for one port pair) are a
separate concern and a separate change, `add-connection-chooser`.

## What Changes

- **Context-menu event (view).** `view.on("context-menu", handler)` returns an
  unsubscribe function. The event fires on a right-click (the DOM `contextmenu` event,
  which also covers Ctrl+click on macOS and a pen's barrel button), on a touch long-press,
  and on the keyboard menu key or Shift+F10 while the editor has focus. Its payload holds:
  - the target: a node, port, connection or the canvas, by stable IDs, taken from the
    existing geometric picking, plus the full ordered hit list;
  - the selection once the selection rule below has run;
  - how the menu was opened (mouse, pen, touch or keyboard) and the modifier keys;
  - client, viewport and world positions for placing a menu.

  Keyboard invocation targets the selection and is placed at the primary selected
  entity, not at the pointer.
- **Selection rule.** A right-click or long-press on an entity that is not selected
  makes it the selection (on a port, its node) before the event fires. On a selected
  entity the selection stays as it is, so a menu can act on a multi-selection. On empty
  canvas the selection is unchanged. Menu items can therefore run the existing selection
  commands unchanged.
- **Browser menu only without listeners.** The native context menu is suppressed only
  while at least one listener is registered. Without listeners the library does nothing
  extra: no selection change, no cancelled press, no long-press timer.
- **Scoping and gestures.** Nothing fires for events from overlay content or text
  fields (INT-06). A right press still starts no tool. A press that has not passed its
  drag threshold is cancelled before the menu opens (for example a macOS Ctrl+click or a
  touch long-press), so it neither selects on release nor drags. During a drag past the
  threshold no event fires.
- **Touch long-press.** A long-press fires after `longPressMs` (default 500 ms;
  `false` turns it off) if the touch stays within the touch drag threshold. It is
  compatible with pan-first drags: moving before the timer pans or moves as today.
  A native `contextmenu` that the browser sends for the same touch is swallowed, so the
  host never gets two events.
- **Small host-menu gaps (view).** `edit.paste` takes an optional world position
  `at`, for "Paste here" from a canvas menu, which also works for touch where there is no
  hover pointer. The overlay gains a `viewport` anchor, so a menu stays put on screen while
  the view pans. Keyboard events from overlay content run no graph shortcut or clipboard
  command, so Escape or Delete in a host menu never reaches the graph.
- **Demo.** The plain-js demo gets an example context menu as example code: items built
  from `view.commands.list()` and `availability`, run through `view.commands.run`, Escape
  and click-away to close.

Implements or refines: new INT-11, INT-11a, INT-11b, INT-11c (context-menu event,
selection and browser menu, scoping and gestures, touch long-press), INT-04 (right-click
outside a tool raises the hook or the browser menu), INT-07 (menu items run the same
commands), UX-01 (keyboard opens context actions), UX-02 (the library ships no menu;
Escape in a host menu runs no graph shortcut), OVL-01 (viewport anchor; menus are host
DOM; overlay content runs no graph shortcuts), EDT-03 (paste at a given position).
Evidence also touches INT-05 (cancel paths), INT-06 (scoping), GEO-04a (ordered hits),
REA-06 / PKG-05 (no timers or listeners before mount) and LIFE-01 (dispose).

### Out of scope

- Any menu, submenu or tooltip component in the library, including focus management
  inside a host's menu.
- A registry query that lists commands with availability for an arbitrary target that
  is not the selection. The selection rule makes the existing `list()` plus
  `availability(id)` enough.
- Connection choices and the connection chooser: `add-connection-chooser`.
- Click-to-route and right-click backtrack (INT-04's routing tool): a later change. This
  change keeps right-click free for menus outside that tool.
- React bindings (`onContextMenu` props): the react slice.
- Haptic or visual long-press feedback. A host can add it in its listener.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `interaction`: new INT-11 to INT-11c (context-menu event: triggers and payload;
  selection rule and native-menu suppression; scoping and gestures; touch long-press).
  INT-04, INT-07, UX-01 and UX-02 gain or change scenarios.
- `canvas-view`: OVL-01: a viewport-anchored overlay element, menus as host DOM in the
  overlay, and overlay content that runs no graph shortcuts.
- `editing-operations`: EDT-03: a paste given an explicit world position centres the
  fragment there.

## Impact

- View, interact: new `src/view/interact/context-menu/` (`context-menu-types.ts`,
  `context-target.ts`, `long-press.ts`, `context-menu-input.ts`), new
  `src/view/interact/input/view-events.ts`. Changed: `tool-types.ts` (`context-menu`
  cancel reason), `thresholds.ts` (`longPressMs`), `dom-input.ts` (its key handling
  moves to a new `input/key-input.ts` first; then a `cancelGesture` method),
  `overlay-host.ts` (`viewport` anchor), `clipboard-commands.ts` and
  `clipboard-service.ts` (`at`). `key-input.ts` and `clipboard-events.ts` stop running
  graph shortcuts for overlay content, so Escape in a host menu no longer clears the
  selection.
- View, mount: new `src/view/view-context-menu.ts`, added to the mount row of
  `src/architecture.test.ts`; `view-editing.ts` creates it, and `view-types.ts` and
  `mount-view.ts` gain `on`; `index.ts`, `advanced.ts`.
  `src/view/platform/dom/layer-stack.ts` turns off the touch callout and text selection
  on the root.
- Docs: `docs/interaction.md`, `docs/guide-view.md`, `docs/architecture.md`. Examples:
  new `examples/plain-js/context-menu.ts`, small wiring in `main.ts` and `index.html`.
- No new runtime dependencies. Core is unchanged. The snapshot format does not change.
