# Proposal

## Why

Connection choices are stuck. When the policy answers "choice required" (CON-04, for
example two connection kinds for one port pair), releasing the connection drag does
nothing: `connect-evaluation.ts` maps the outcome to `pending` and the tool commits
nothing. Picking between alternatives needs a person to decide, and the library has no
way to ask. The core cannot even express the answer: a policy's alternatives have no
identity, so a `connect` command cannot say which one it means. Which *port* a drop lands
on is not such a case: as in QtNodes, the existing deterministic pick order decides.

The library will not ship picker UI. Hosts have their own design systems, so this
change adds a hook the host answers. The user doubts the mechanism is worth its size, so
it is built as minimally as the spec allows, kept in its own files, tried in the demo,
and its size is recorded before deciding whether to keep it.

## What Changes

- **Choosing a policy alternative (core).** Each alternative in a policy `choice`
  outcome carries a stable `key`. The `connect` command and the `ConnectionProposal`
  accept `choice: key`, and the policy must then accept exactly that alternative. The
  planner re-evaluates it, so the commit is validated again (CON-03, CON-05). A policy
  that answers `choice` again for a named key is rejected with `choice-required`.
  **BREAKING** for host policies that return `choice`, because each alternative now needs a
  `key`.
- **Connection-choice hook (view).** `InputOptions.chooseConnection` (and
  `view.setConnectionChooser`) takes one async function. The release target is picked as
  today, by the existing deterministic candidate order, and is never asked about. Only
  when the policy returns a `choice` with several alternatives for that target does the
  function receive a request: the source, the target, its alternatives as options (each
  with a key, connection kind, policy label and plan, in policy order), the release
  position, and an `AbortSignal`. It returns an option key, or `undefined` to cancel. The
  gesture stays pending, with its preview frozen, until the function returns. Choosing
  an option commits one `connect` and one history entry; cancelling commits nothing.
  Escape, a new press on the canvas, dispose, a document reset and removal of the source
  or target port cancel it and abort the signal. With no chooser, a policy choice is
  never picked automatically (nothing is committed), and the target shows a
  choice-required glyph.
- **Demo.** The plain-js demo gets an example choice picker as example code, and a demo
  policy under which one port pair offers two connection kinds, so the picker can be
  tried.

Implements or refines: new INT-12, INT-12a, INT-12b (connection-choice request, pending
resolution, release without a chooser), CON-04 (alternative keys and choosing one).
Evidence also touches UX-02 (choice-required cue not color alone; Escape leaves a
pending choice), INT-04 (drag to connect), INT-05 (cancel paths), INT-08 (one entry or
none), CON-05 (revalidation at commit), GEO-04a (deterministic target order) and LIFE-01
(dispose).

**Dependency.** Applied after `add-context-menu-hook`, whose overlay keyboard scoping
keeps keys in the host's picker away from graph shortcuts. Nothing else is shared.

### Out of scope

- Any picker or popover component in the library.
- Choices during reconnection or paste (`plan-external.ts`, `paste-commit.ts` keep
  treating `choice` as a refusal), and composite member-mapping choices (SIG-04, SIG-05):
  the composite-signature slice.
- A keyboard connection chooser (UX-01 does not require one).
- React bindings (a hook for the chooser): the react slice.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `interaction`: new INT-12 to INT-12b (connection-choice request and options; pending
  resolution and cancellation; default without a chooser).
- `connection-policy`: CON-04: alternatives carry stable keys, and a proposal that
  names a key resolves to that alternative or is rejected.

## Impact

- Core: `src/core/edit/policy/types.ts` (`ConnectionAlternative` with `key` and an
  optional `label`, `ConnectionProposal.choice`); `src/core/edit/commands/types.ts`
  (`connect.choice`, `ChoiceAlternative.key`); `src/core/edit/commands/connect.ts`.
  The core tests that build `choice` outcomes need keys.
- View, interact: new `src/view/interact/choice/` (`choice-types.ts`,
  `choice-request.ts`, `connection-choice.ts`). Changed: `connect-tool.ts`,
  `connect-evaluation.ts`, `tool-types.ts` (`choose` effect, `chooserInstalled`),
  `effect-runner.ts`.
- View, render: `preview-types.ts` (`choice` candidate state), `connect-glyphs.ts` (a
  non-color glyph for it).
- View, mount: new `src/view/view-connection-choice.ts`, added to the mount row of
  `src/architecture.test.ts`; `view-editing.ts` creates it, and `view-types.ts` and
  `mount-view.ts` gain `setConnectionChooser`; `index.ts`, `advanced.ts`.
- Docs: `docs/interaction.md`, `docs/guide-view.md`, `docs/guide-using-the-model.md`,
  `docs/architecture.md`. Examples: new `examples/plain-js/choice-picker.ts` and a demo
  policy, small wiring in `main.ts` and `index.html`.
- No new runtime dependencies. Core stays headless. The snapshot format does not change.
