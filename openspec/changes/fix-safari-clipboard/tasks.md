# Tasks

## 1. Reproduce

- [ ] 1.1 Run the manual checklist of section 4 on the current code in Safari (versions the owner chose, see design open questions) with `npm run demo`; verify by a dated entry in `notes.md` per browser and OS version saying, line by line, whether each shortcut works today; if all lines pass, record "not needed", stop here and close the change
- [ ] 1.2 Get the owner's answers to the open questions in `design.md` (proxy everywhere or WebKit only, `safaridriver` opt-in, versions and devices); verify by recording them in `notes.md` and updating the design

## 2. Clipboard proxy (view/interact)

- [ ] 2.1 Add the proxy element (D2) created at mount and removed at dispose, and focus it on the key-down of a `native` clipboard chord while the editor owns focus; verify `clipboard-proxy.test.ts` named for the rule of clipboard shortcuts without a text selection and the no global side effects rule: nothing is created at import, the proxy has the hidden, non-tabbable, `inputmode="none"` attributes, a repeated key-down does nothing new, a chord in a text field or overlay host content does not touch the proxy, dispose removes the proxy and its listeners
- [ ] 2.2 Let the bridge treat the proxy as the editor's own element and return focus to the root on the clipboard event, key-up, blur or after one frame (D2); verify `clipboard-events.browser.test.ts` in Chrome named for the rule of clipboard shortcuts without a text selection, the keyboard editing shortcuts rule and the input scoping rule: Mod+C then Mod+V pastes the copied nodes once with one history entry, Mod+X removes them once, focus is back on the root after each, the page does not scroll, two editors on one page keep separate clipboards, a text field in the overlay keeps its own copy and paste
- [ ] 2.3 Add the `clipboardProxy` view option if the owner chose "every browser" (D3), or the WebKit-only switch otherwise, and classify it in the React wrapper's option table; verify `src/view/mount-view.browser.test.ts` and `src/react/node-editor-options.browser.test.ts` named for the rule of clipboard shortcuts without a text selection that `false` leaves today's behavior and that a change of the option does not remount

## 3. Docs

- [ ] 3.1 Document the proxy, its focus move and the option in `docs/guide-view.md`, and replace the unverified Safari note in the docs with the checklist result; verify `npm run lint` and a read-through

## 4. Manual verification checklist (no WebKit in CI)

Run with `npm run demo` in each Safari version and device the owner chose; record each line as pass or fail with browser and OS version and date in `notes.md`. Each line names the scenario it checks.

- [ ] 4.1 Copy and paste (scenario "Copy and paste in Safari"): focus the canvas by clicking empty space, select two connected nodes, press Cmd+C, move the pointer, press Cmd+V; one copy of both nodes and their connection appears at the pointer, it becomes the selection, and one undo removes it
- [ ] 4.2 Cut (scenario "Cut in Safari"): select one node, press Cmd+X; the node is removed in one history entry, and Cmd+V brings it back as a copy
- [ ] 4.3 Edit menu (scenario "Copy and paste in Safari"): with nodes selected and the canvas focused, Edit > Copy and Edit > Paste are enabled and do the same as the shortcuts, once each
- [ ] 4.4 Paste from another application (scenario "Paste of foreign text"): copy plain text in another application and press Cmd+V on the canvas; nothing is pasted and the refusal reports that the text is not a fragment
- [ ] 4.5 Text field (scenario "Text field keeps its clipboard"): in a text field of an overlay editor, Cmd+C, Cmd+X and Cmd+V act on the field's text and no graph command runs
- [ ] 4.6 Two editors (scenario "Two editors"): with two editors in the demo, copy in one and paste in the other; the paste lands only in the focused editor
- [ ] 4.7 No side effects (scenario "No side effects"): during each shortcut the page does not scroll, focus ends on the editor root (the next arrow key nudges the selection), no on-screen keyboard opens on iPadOS with a hardware keyboard, and VoiceOver announces nothing extra
- [ ] 4.8 Held shortcut (scenario "Copy and paste in Safari"): holding Cmd+V for a second pastes once
- [ ] 4.9 Regression in Chrome and Firefox: lines 4.1, 4.2, 4.5 and 4.6 pass in Chrome and Firefox too

## 5. Gates

- [ ] 5.1 Run `npm run lint`, `npm run typecheck`, `npm test`, `npm run test:browser`, `npm run build` and `openspec validate fix-safari-clipboard --strict`; verify all pass (long-requirement warnings aside) and record results in `notes.md`
