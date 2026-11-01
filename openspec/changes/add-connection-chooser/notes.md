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

## Gate results (task 6.1)

- `npm run lint`: 446 files, no findings.
- `npm run typecheck`: all four passes clean (including the core-only pass).
- `npm test`: 114 files, 673 tests passed (`src/architecture.test.ts` included).
- `npm run test:browser` (installed Google Chrome): 36 files, 174 tests passed.
- `npm run build`: ok.
- `npm run bench:size` (gzip): core 30.9 KiB (budget 75), view 41.8 KiB (budget 150),
  advanced 26.5 KiB, react 41.8 KiB. All budgets met.
- Files over 300 lines among those changed: only `src/view/mount-view.ts` (338, the
  accepted exception). `view-editing.ts` is at 298 after the `removedIds` refactor;
  `examples/plain-js/main.ts` at 294.

## Size

Measured with `git diff --numstat` from `ac4dc5b` (end of `add-context-menu-hook`) to the
end of this change, gzip from `scripts/bundle-size.mjs` (exact bytes) at both commits.

| Part | Library code | Test code | Example |
| --- | --- | --- | --- |
| Context menu (`add-context-menu-hook`, for comparison) | +820 / -50 | +749 / -1 | +120 |
| Chooser, total | +474 / -34 | +745 / -2 | +96 / -1 |
| of which core policy keys | +37 / -3 | +167 / -2 | |
| of which view (choice state, glyph, release rule, controller, wiring, exports) | +437 / -31 | +578 / 0 | |

The view figure includes the `removedIds` refactor (+10 / -9, a move). Bundle (gzip):
view 41,829 -> 42,768 bytes (+939, about +0.9 KiB), core 31,582 -> 31,650 (+68),
advanced 26,578 -> 27,164 (+586).

Removing the chooser again means deleting `src/view/interact/choice/`,
`src/view/view-connection-choice.ts`, `connect-choice-tool.test.ts`,
`connection-choice.browser.test.ts` and `examples/plain-js/choice-picker.ts`, and
reverting a few lines in `connect-tool.ts`, `connect-candidates.ts`, `tool-types.ts`,
`tool-context.ts`, `effect-runner.ts`, `view-editing.ts`, `view-types.ts`,
`mount-view.ts`, the two entry files and `main.ts`. The core keys and the
choice glyph could stay on their own: they make a policy `choice` addressable and
visible even without a chooser.

## Documentation (group 7)

- `docs/interaction.md`: the candidate table gains the fork glyph (pending no longer
  covers choices), the release sequence gains the chooser branch, and a new section 4b
  covers target order, pending state, cancellation and the default without a chooser.
  `choiceTiePx` appears nowhere.
- `docs/guide-view.md`: `setConnectionChooser` with an async example and `AbortSignal`.
- `docs/guide-using-the-model.md`: alternative keys, `connect` with `choice`, and the
  policy contract (unique stable keys, accept exactly the named one, the stored record
  must validate on its own).
- `docs/architecture.md`: the choice controller beside the router, why it is not a
  router gesture, and the code map. All Mermaid blocks render (mermaid 11, headless
  Chrome).
