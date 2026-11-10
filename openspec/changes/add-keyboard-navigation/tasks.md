# Tasks

## 0. Approval

- [ ] 0.1 Get the owner's approval of the wider accessibility scope and answers to the open questions in `design.md` (chords, focus and selection, connections in the focus order, screen-reader matrix); verify by recording the decisions in `notes.md` and updating `design.md`, the proposal and the delta specs to match before any later task starts
- [ ] 0.2 Rewrite the trimmed accessibility item in the `context` of `openspec/config.yaml` with the wording of design D0 (and drop the "no keyboard connection chooser" phrase, also from any non-goals paragraph `close-archive-gaps` adds); verify by reading `openspec/config.yaml`, `openspec validate --specs --strict` reporting no errors, and a search that no other planned change still calls keyboard connection out of scope without pointing here

## 1. Focused entity and navigation (view/interact)

- [ ] 1.1 Add the focused entity to the view (D3) with `view.focusEntity` and the `focus-entity` event, cleared when its entity leaves the model and on reset; verify `focus-state.test.ts` named for the keyboard focus between nodes rule: set, clear, a removed node clears focus, a removed port falls back to its node, a reset clears, two views keep separate focus, and nothing reaches the model, history or a snapshot
- [ ] 1.2 Implement spatial and reading-order navigation as pure functions (D1) in `interact/focus/`; verify `focus-navigation.test.ts` named for the keyboard focus between nodes rule and the deterministic ordering rule: the cone rule picks the nearest node, ties break by ID, nothing in a direction keeps focus, reading order is top, then left, then ID and wraps, results are identical for shuffled input
- [ ] 1.3 Bind the chords the owner chose and the selection keys (D2, D7) as default keymap entries with command IDs; verify `keymap.test.ts` and `view-commands.test.ts` named for the keyboard focus between nodes rule and the keyboard editing shortcuts rule: each chord runs its command once, Tab still leaves the root, keys in a text field do nothing, a host keymap can unbind each, and Space and Enter change the selection as decided

## 2. Focus ring (view/render)

- [ ] 2.1 Add the focus-ring interaction painter and theme tokens (D4); verify `focus-ring.test.ts` named for the focus ring and reveal rule and the usable shipped controls rule: the ring follows the node outline and port anchor at zoom 0.5 and 2, has a non-color cue, only the interaction layer repaints when focus moves, and it hides after pointer input until the next key
- [ ] 2.2 Reveal on focus move; verify a browser test `src/view/keyboard-focus.browser.test.ts` in Chrome named for the focus ring and reveal rule that moving focus to an off-screen node pans it into view and that the scene layer is not repainted by focus alone

## 3. Keyboard connection (view/interact)

- [ ] 3.1 Implement `keyboard-connect-tool.ts` as a pure transition function with the states of D5, reusing the candidate search and evaluation; verify `keyboard-connect-tool.test.ts` named for the keyboard connection rule, the connection-choice request rule, the pending target resolution rule, the gesture lifecycle and cancellation rule and the one committed edit per gesture rule: Enter on a compatible candidate submits one `connect` and one history entry, an incompatible one commits nothing and reports its `rejection`, a choice sends one chooser request, a pending one waits and commits once on acceptance, Escape, blur and locking cancel, candidates are in the existing deterministic order
- [ ] 3.2 Involved entities (D5); verify `gesture-reconcile.test.ts` gains cases named for the rule that gestures yield to any change of their entities: a local edit, an undo and an external change of the source node cancel with `entity-changed`, `entity-changed` and `external-change`, removing the awaited target cancels with `entity-removed`, a change to a candidate that is only focused does not cancel
- [ ] 3.3 Browser test `src/view/keyboard-connect.browser.test.ts` in Chrome named for the keyboard connection rule: focus a node, enter its ports, start a connection, walk to a compatible port and press Enter; assert one connection, one history entry and that undo removes it; repeat with an incompatible target (nothing committed) and with a host chooser (the chooser is called once)

## 4. Announcements (view/mount, view/render)

- [ ] 4.1 Add the live region, the describer option, the message keys, coalescing and the `announce` event (D6); verify `announcer.test.ts` named for the spoken announcements rule: one region per view in the overlay, coalesced per frame, a repeat within 500 ms suppressed, the host describer and messages replace every default string, the option turns the region off and the event still fires, disposal removes the region
- [ ] 4.2 Announce focus, keyboard selection, keyboard connection states, commits, refusals, cancellations and undo or redo labels; verify `src/view/announcements.browser.test.ts` in Chrome named for the spoken announcements rule that the region's text after each action is the expected string and that pointer-only actions announce nothing new

## 5. Manual check, docs and gates

- [ ] 5.1 Manual screen-reader check with the demo on the readers the owner chose (proposed: VoiceOver with Safari, NVDA with Chrome and Firefox): reach every node, select two, make a connection, hear each announcement, leave the editor with Tab; verify by a dated entry per reader and browser in `notes.md` with what worked and what did not
- [ ] 5.2 Document the keyboard map, the focused entity, the describer, the announcer option and the remaining limits in `docs/guide-view.md` and `docs/interaction.md`, and update the accessibility limits in `docs/architecture.md`; verify `npm run lint` and a read-through that no text still says keyboard connection is out of scope
- [ ] 5.3 Run `npm run lint`, `npm run typecheck`, `npm test`, `npm run test:browser`, `npm run build` and `openspec validate add-keyboard-navigation --strict`; verify all pass (long-requirement warnings aside) and record the results in `notes.md`
