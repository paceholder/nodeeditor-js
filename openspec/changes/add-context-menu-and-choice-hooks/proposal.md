# Proposal

## Why

A host cannot attach a context menu to the editor today. A right press is ignored by
every tool and the browser's own menu opens. The view raises no event saying what was
under the pointer, touch has no long-press, and the keyboard menu key does nothing, even
though the keyboard editing shortcuts rule asks for keyboard access to context actions. Connection choices are also
stuck. When the policy answers "choice required" (the structured policy outcomes rule, for example two connection kinds
for one port pair), releasing the connection drag does nothing: `connect-evaluation.ts`
maps the outcome to `pending` and the tool commits nothing. When several compatible ports
sit at the same spot, the tool quietly takes the first one in pick order. Both cases need a
person to decide, and the library has no way to ask.

The library will not ship menu or picker UI. Hosts have their own design systems, and
the usual JavaScript-library answer is a hook: React Flow's `onNodeContextMenu` /
`onPaneContextMenu`, or Cytoscape's menu as a separate plugin. This change adds two hooks,
one for the context menu and one for connection choices, plus the small gaps a host menu
needs: paste at a given position and an overlay anchor fixed to the screen.

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
  fields. A right press still starts no tool. A press that has not passed its
  drag threshold is cancelled before the menu opens (for example a macOS Ctrl+click or a
  touch long-press), so it neither selects on release nor drags. During a drag past the
  threshold no event fires.
- **Touch long-press.** A long-press fires after `longPressMs` (default 500 ms;
  `false` turns it off) if the touch stays within the touch drag threshold. It is
  compatible with pan-first drags: moving before the timer pans or moves as today.
  A native `contextmenu` that the browser sends for the same touch is swallowed, so the
  host never gets two events.
- **Connection-choice hook (view).** `InputOptions.chooseConnection` (and
  `view.setConnectionChooser`) takes one async function. When a connection drag is
  released over several valid options, the function receives a request: the source, the
  options (each with a key, target endpoint, connection kind, policy label and plan), the
  release position, and an `AbortSignal`. It returns an option key, or `undefined` to
  cancel. The options are the ports tied for nearest, plus every alternative a policy
  returned for one port pair. The gesture stays pending, with its preview frozen, until
  the function returns. Choosing an option commits one `connect` and one history entry;
  cancelling commits nothing. Escape, a new press on the canvas, dispose, a document reset
  and removal of the source or an option's port cancel it and abort the signal. With no
  chooser, a policy choice is never picked automatically (nothing is committed), and tied
  ports keep today's deterministic pick order.
- **Choosing a policy alternative (core).** Each alternative in a policy `choice`
  outcome carries a stable `key`. The `connect` command and the `ConnectionProposal`
  accept `choice: key`, and the policy must then accept exactly that alternative. The
  planner re-evaluates it, so the commit is validated again. A policy
  that answers `choice` again for a named key is rejected with `choice-required`.
  **BREAKING** for host policies that return `choice`, because each alternative now needs a
  `key`.
- **Small host-menu gaps (view).** `edit.paste` takes an optional world position
  `at`, for "Paste here" from a canvas menu, which also works for touch where there is no
  hover pointer. The overlay gains a `viewport` anchor, so a menu stays put on screen while
  the view pans.
- **Demo.** The plain-js demo gets an example context menu and a choice picker as
  example code: items built from `view.commands.list()` and `availability`, run through
  `view.commands.run`, Escape and click-away to close. One demo port type offers two
  connection kinds, so the picker can be tried.

Implements or refines: new the context-menu event rule, the context-menu selection and browser menu rule, the context-menu scoping and gestures rule and the touch long-press rule (context-menu event,
selection and browser menu, scoping and gestures, touch long-press), new the connection-choice request rule,
the pending choice resolution rule and the release without a chooser rule (connection-choice request, pending resolution, release without a
chooser), the connection gestures rule (right-click outside a tool raises the hook or the browser menu), the unified commands rule
(menu items run the same commands), the keyboard editing shortcuts rule (keyboard opens context actions), the usable shipped controls rule (the
library ships no menu; Escape leaves a pending choice), the structured policy outcomes rule (alternative keys and
choosing one), the DOM overlay slot rule (viewport anchor; menus are host DOM), the duplicate and paste fragments rule (paste at a given
position). Evidence also touches the gesture lifecycle and cancellation rule (cancel paths), the input scoping rule (scoping), the one committed edit per gesture rule (one
entry or none), the commit-time revalidation rule (revalidation at commit), the hit result identity and order rule (deterministic ties), the server rendering safety rule /
the no global side effects rule (no timers or listeners before mount) and the per-instance disposal rule (dispose).

### Out of scope

- Any menu, submenu, picker, popover or tooltip component in the library, including
  focus management inside a host's menu.
- A registry query that lists commands with availability for an arbitrary target that
  is not the selection. The selection rule makes the existing `list()` plus
  `availability(id)` enough.
- Click-to-route and right-click backtrack (the connection gestures rule's routing tool): a later change. This
  change keeps right-click free for menus outside that tool.
- Choices during reconnection or paste (`plan-external.ts`, `paste-commit.ts` keep
  treating `choice` as a refusal), and composite member-mapping choices:
  the composite-signature slice.
- React bindings (`onContextMenu` props, a hook for the chooser): the react slice.
- Haptic or visual long-press feedback. A host can add it in its listener.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `interaction`: new the interaction requirements (context-menu event: triggers and payload;
  selection rule and native-menu suppression; scoping and gestures; touch long-press)
  and the interaction requirements (connection-choice request and options; pending resolution and
  cancellation; default without a chooser). The connection gestures rule, the unified commands rule, the keyboard editing shortcuts rule and the usable shipped controls rule gain or change scenarios.
- `connection-policy`: the structured policy outcomes rule: alternatives carry stable keys, and a proposal that
  names a key resolves to that alternative or is rejected.
- `canvas-view`: the DOM overlay slot rule: a viewport-anchored overlay element, and menus as host DOM in
  the overlay.
- `editing-operations`: the duplicate and paste fragments rule: a paste given an explicit world position centres the
  fragment there.

## Impact

- Core: `src/core/edit/policy/types.ts` (`ConnectionAlternative` with `key` and an
  optional `label`, `ConnectionProposal.choice`); `src/core/edit/commands/types.ts`
  (`connect.choice`, `ChoiceAlternative.key`); `src/core/edit/commands/connect.ts`.
  The core tests that build `choice` outcomes need keys.
- View, interact: new `src/view/interact/context-menu/` (`context-menu-types.ts`,
  `context-target.ts`, `long-press.ts`, `context-menu-input.ts`), new
  `src/view/interact/choice/` (`choice-types.ts`, `choice-options.ts`,
  `connection-choice.ts`), new `src/view/interact/input/view-events.ts`. Changed:
  `connect-tool.ts`, `connect-evaluation.ts`, `tool-types.ts` (`choose` effect,
  `context-menu` cancel reason), `thresholds.ts` (`longPressMs`, `choiceTiePx`),
  `effect-runner.ts`, `dom-input.ts` (its key handling moves to a new
  `input/key-input.ts` first; then a `cancelGesture` method), `overlay-host.ts`
  (`viewport` anchor), `clipboard-commands.ts` and `clipboard-service.ts` (`at`).
  `key-input.ts` and `clipboard-events.ts` stop running graph shortcuts for overlay
  content, so Escape in a host menu no longer clears the selection.
- View, render: `preview-types.ts` (`choice` candidate state), `connect-glyphs.ts` (a
  non-color glyph for it).
- View, mount: new `src/view/view-hooks.ts`, added to the mount row of
  `src/architecture.test.ts`; `view-editing.ts` creates it, and `view-types.ts` and
  `mount-view.ts` gain `on` and `setConnectionChooser`; `index.ts`, `advanced.ts`.
  `src/view/platform/dom/layer-stack.ts` turns off the touch callout and text selection
  on the root.
- Docs: `docs/interaction.md`, `docs/guide-view.md`, `docs/guide-using-the-model.md`,
  `docs/architecture.md`. Examples: new `examples/plain-js/context-menu.ts` and
  `choice-picker.ts`, small wiring in `main.ts` and `index.html`.
- No new runtime dependencies. Core stays headless. The snapshot format does not change.
