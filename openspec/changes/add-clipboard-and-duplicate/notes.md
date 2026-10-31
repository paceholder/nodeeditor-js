# Implementation notes

Deviations from design.md, clarifications made while implementing, and observations.

## Deviations and clarifications

- **`ExcludedReference` lives in `core/edit/commands/types.ts`**, not in
  `fragment-types.ts`: `PlanEffects.excluded` (core/edit) needs it and core/edit must not
  import core/io. `fragment-types.ts` re-exports it. Its `reason` is typed
  `"external" | "endpoint-missing" | RejectionCode`.
- **Fragments always hold payloads in JSON form.** `extractFragment` encodes through the
  codec; `parseFragmentText` / `parseFragmentValue` run the codec's `decode` to validate
  but return the encoded fragment, so a parsed fragment round-trips (deep-equal, identical
  text) and can be handed to the `paste` command, which decodes again when it builds
  records. `readFragment` (internal) returns the decoded payloads alongside.
- **Paste remap order** (D5 step 3) reads "each node followed by its ports" (as
  `createNode` does), then internal connections, then preserved external connections.
- **Pasted `z`** is `frontZ + i` in fragment (paint) order, so the paste is on top and
  keeps its relative stacking strictly.
- **`parseFragmentText`** refuses text that does not contain the marker string before
  calling `JSON.parse`; invalid JSON is also `not-a-fragment`. A missing `external` list
  in a host-built envelope is accepted as empty.
- **`external: "preserve"` with a connection that had no endpoint inside the fragment**
  (a selected connection between two unselected nodes) is excluded with reason
  `external`: there is no inside endpoint to re-create it from.
- **`GraphModel` exposes `payloadCodecs` and `fragmentLimits`** (the options it was given),
  so the view copies with the same codecs the model pastes with. The view reads them
  with a structural check (`fragmentOptionsOf`); `EditableModel` is unchanged.
- **Clipboard event listeners are on the document, not the root** (D8 said root).
  Browsers target `copy`/`cut`/`paste` at the focused element only when it is editable,
  otherwise at the selection or `<body>`. The bridge acts only while
  `document.activeElement` is inside this editor's root and is not a text field, so two
  editors still never share an event and overlay text fields keep their own clipboard
  (INT-06).
- **`DomInputDeps.onKey` returns `boolean | "native"`**; `"native"` leaves the key-down's
  default alone. `ResolvedKey` gained `native: boolean`.
- **`edit.paste` availability without event text and without an in-app buffer** is
  unavailable with `not-a-fragment` ("The clipboard holds no graph fragment") rather than
  "available on any editable model": with nothing to dry-run, read-only mode cannot be
  detected through `EditableModel`, and the synchronous command can only paste the
  buffer. With event text the command is available whenever the model is editable, and
  `run` reports foreign text as `not-a-fragment` (so `on("paste")` sees it). With a buffer
  it dry-runs the paste, which surfaces read-only and policy refusals.
- **Service API extras:** `buffer()`, `canPaste(text?)`, `canDuplicate()`, and the events
  `copy` and `cut` besides `paste` and `clipboard-error`. `PasteReport.status` is
  `accepted | pending`. The view-level types live in `clipboard-types.ts` to keep the
  service under 300 lines.
- **`registerBuiltinCommands(registry, clipboard?)`** registers the four clipboard
  commands only when given a service; `COMMAND_IDS` includes their IDs.

## Browser behaviour observed

- Headless Google Chrome (MacIntel, Vitest browser mode via Playwright): pressing
  Meta+C / Meta+X / Meta+V with a focused non-editable `<div tabindex=0>` fires
  `copy`, `cut` and `paste` events targeted at that div, with readable/writable
  `clipboardData`. The end-to-end shortcut tests therefore exercise the native route,
  not the one-task fallback.
- Synthetic `KeyboardEvent`s (untrusted) never trigger clipboard events; with them the
  one-task fallback runs the command on the in-app buffer.

## Deferred: Firefox and Safari check (task 6.5)

Postponed by user decision (2026-10-31): Chrome-only for now. For the later check, on
the plain-js demo (`npm run demo`) in current Firefox and Safari, record the browser
versions and try:

1. Select two connected nodes, Mod+C, move the pointer elsewhere over the canvas,
   Mod+V: the copy appears centred at the pointer, selected, one undo removes it.
2. Mod+V again without moving the mouse: the next copy is offset by one step.
3. Mod+X on a selection: removed in one undo step; Mod+V brings a copy back.
4. Mod+D on one node: a copy one step away, selected; the browser's bookmark dialog
   does not open.
5. Copy in one tab, paste in a second tab of the demo (cross-tab, system clipboard).
6. Copy ordinary text from another app, Mod+V in the editor: nothing pasted, the status
   line explains the clipboard holds no graph fragment.
7. Click into an overlay text field (if the demo has one) and press Mod+C/Mod+V: the
   field's own copy/paste happens, the graph is untouched.
8. Note whether the `paste` event fires at all on the focused canvas (Safari is the
   suspect); if not, paste only works from the in-app buffer through the one-task
   fallback, which should be reported here.

## Demo check (task 7.1)

A headless Chrome (Playwright, installed Chrome channel) run against `npm run
demo:preview`: Mod+A, Mod+C, pointer over the canvas, Mod+V pasted 6 nodes; Export then
Import of the exported text pasted 6 nodes; importing plain text reported "The text holds
no graph fragment"; Mod+D duplicated the selection. No console errors. The demo's own
window-level `M`/`G`/`E` shortcuts now ignore keys typed into the dialog's textarea.
