# Implementation notes

Deviations from design.md, clarifications made while implementing, observations, gate
results and size. The size baseline is `ac4dc5b` (the end of `add-context-menu-hook`).

## Deviations and clarifications

- **The re-asking guard is in `planConnect`, before `nonAccept`**: a `choice` outcome for
  a command that named a key becomes `rejected` with `choice-required` and a message
  naming the key. A command without a key still gets `choice-required` with the keyed
  alternatives, as before.
- **`ChoiceAlternative.label`** is the policy label, else the old `n1.p1 to n2.p2` text;
  `ChoiceAlternative.plan` stays a plain `ConnectionPlan` (key and label are stripped).
- **The connect-choice test policy** wraps the default policy: no kind offers `fast` and
  `slow`, a key or a stored kind is accepted with that kind, so the commit validator
  (which passes the stored kind) accepts the chosen record; the "Revalidated" case is
  the default policy's input capacity.
- **The `choose` effect carries the policy alternatives, not built options**
  (`ChoiceRelease { source, target, alternatives, at }`); the controller turns them into
  options with `choiceOptions` and adds the positions and the signal. So the tool layer
  needs no chooser types.
- **`EffectHost.choose` is optional**: a host without a chooser ignores the effect (the
  tool never emits it then anyway, because `chooserInstalled` is false).
- **The connect preview's `target` now also snaps to a choice port**, since it is the
  release target (D2). The cursor over a choice port is the crosshair, like a compatible
  one; the glyph is a fork in the compatible color.
- **The choice-tool cases live in a new `connect-choice-tool.test.ts`**:
  `connect-tool.test.ts` was already 319 lines. Every existing connect test passes
  unchanged.
- **The controller has no separate pure transition function**: its union has two states
  and every exit is the same `finish(aborted)`, so the class of bugs a transition table
  guards against (an unhandled input in some state) does not arise. `open`, `cancel`,
  `entitiesRemoved`, `setChooser` and `dispose` are the inputs.
- **A successful choice does not abort the signal**; every other exit does. A second
  release while one is pending cancels the first (its signal aborts, its late answer is
  ignored).
- **`cancel()` takes no reason**: nothing downstream distinguishes them.
- **No `onKey` wrapper**: `view-connection-choice.ts` has one capture-phase `keydown`
  listener on the root. While a choice is pending it cancels on Escape (from the root or
  the overlay picker, stopping the event so `selection.clear` does not run) and stops
  every other key not aimed at overlay content with `preventDefault` and
  `stopImmediatePropagation`. The `preventDefault` also keeps Mod+V/C/X from firing the
  native clipboard events that would otherwise paste or copy while pending. This also
  keeps the menu key from opening a context menu while pending, without the context-menu
  code knowing about choices.
- **`view-connection-choice.ts` subscribes to the model itself** (removals and reset), so
  `view-editing.ts` only creates it, passes `choose` and `chooserInstalled`, and exposes
  `setConnectionChooser`. A pure refactor commit moved `removedIds` to
  `platform/model-binding.ts` first, so both share it and `view-editing.ts` stays at 298
  lines.
- **`ChoiceRelease` is exported from `nodeeditor-js/view`** with the other tool types,
  since `ToolEffect` names it.
- **`setConnectionChooser` without editing input is a no-op**, like `on` without input.

## Demo check (task 5.1)

`npm run demo:build`, then `vite preview` on a spare port and a headless Playwright run in
the installed Chrome (`channel: "chrome"`, script kept out of the repo):

- dragging the level sensor's "level" onto the controller's "setpoint" opened the picker
  at the drop point with "Direct link (direct)" and "Delayed link (delayed)"; the target
  showed the fork glyph and the reason "Several connections are possible; a choice is
  required";
- Escape closed it and created nothing; dropping again and clicking "Delayed link"
  created one dashed link; Ctrl/Cmd+Z removed it in one step;
- a drop between two pipe ports (default policy) connected without a picker;
- the context menu still worked (right-click, Shift+F10); no console errors.
- The demo policy offers the choice only for sensor-to-controller signal links; a
  `delayed` kind gets a dashed painter so the chosen kind is visible.
