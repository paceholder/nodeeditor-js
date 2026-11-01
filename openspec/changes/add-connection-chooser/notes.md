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
