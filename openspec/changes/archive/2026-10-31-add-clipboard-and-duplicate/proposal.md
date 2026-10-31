# Proposal

## Why

Slice A ends with create, connect, move, delete and undo, but a user still cannot copy
part of a diagram, cut it, paste it, or duplicate it in place (UC-09). Building a
physical-system schematic without these means rebuilding every repeated sub-circuit by
hand. The graph snapshot (`add-graph-snapshot`) already reserves the fragment form
("a snapshot without an ID cursor") and its validator already has a `fragment` mode, so
the data side is ready. This is the first change of Slice B.

## What Changes

- **Fragment extraction (core).** Turn a selection of nodes and connections into a fragment
  in the graph snapshot shape: the selected nodes with their payloads and dynamic ports,
  plus every connection whose both endpoints are selected nodes. Connections that reach an
  unselected node are left out and listed as external references.
- **Clipboard text format (core).** A small versioned JSON envelope with a format marker
  around the fragment and its external-reference list, plus parsing that checks the text
  length before parsing and then runs the one snapshot validator in fragment mode.
- **`paste` and `duplicate` model commands (core).** Planners that validate the fragment
  (shape, size limits, registered and creatable types), give every node, port and
  connection a fresh ID, remap all internal references, place the fragment, and produce one
  add-only patch. The normal dry run then applies capability and connection-policy checks
  before anything changes. External references are excluded by default and reported; a
  host can opt in to keep them. One paste or duplicate is one history entry.
- **Editor commands and shortcuts (view).** `edit.copy`, `edit.cut`, `edit.paste` and
  `edit.duplicate`, bound to Mod+C, Mod+X, Mod+V and Mod+D in the default keymap. Cut is
  copy followed by the existing atomic delete (EDT-02) and adds one history entry. After a
  paste or duplicate the new entities become the selection.
- **Clipboard bridge (view).** Keyboard copy, cut and paste go through the browser's
  native clipboard events, which need no permission prompt. The command API uses the async
  Clipboard API when it is allowed. An in-app fragment buffer and an explicit
  export/import text API keep working when the system clipboard is denied.
- **Paste placement.** With the pointer over the view, the fragment's bounding-box centre
  goes to the pointer. Otherwise it goes to the original position plus an offset that grows
  with each repeated paste of the same fragment.

Implements or refines: EDT-03, EDT-03a, EDT-04, EDT-05, EDT-06 (new: cut), UX-01 (clipboard
shortcuts), INT-07, INT-08, TXN-01, PAT-04, CON-03 (paste goes through the active policy),
MOD-03 (fresh IDs, no reuse), MOD-08 (deterministic fragment order), MOD-11 (read-only
and capabilities on paste), SAFE-01 and SAFE-03 (clipboard text is untrusted and limited),
SER-02 (payload codecs for clipboard text).

### Out of scope

- Groups and route constraints in fragments. Neither capability exists yet; the snapshot's
  `groups` and `routes` sections stay reserved and empty. Fragments gain them when those
  capabilities land (Slice C).
- Reference bindings, provided values and assemblies in fragments (the "copy a view of a
  source" part of EDT-04). Their snapshot sections are reserved too.
- Allowed-subset plans for cut or paste when part of the selection is protected; cut
  rejects as a whole, exactly like delete today.
- Replace node (EDT-01, SHOULD).
- Drag-and-drop of fragments between windows, HTML or image clipboard flavours, and
  pasting into a second editor in another tab beyond what plain text already allows.
- A shipped import/export dialog. The library exposes the text API; the example shows a
  minimal host dialog.
- React bindings for the new commands (react slice).

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `editing-operations`: EDT-03 gains scenarios for paste at the pointer, the growing
  offset, internal connections and duplicate; EDT-04 gains the opt-in preserve option;
  EDT-05 gains scenarios for unregistered types, policy rejection and the text marker; new
  EDT-06 defines cut as one history entry.
- `interaction`: UX-01 adds copy, cut, paste and duplicate to the keyboard commands, with a
  scenario for the default chords.

## Impact

- New core module `src/core/io/fragment/` (extract, envelope text, paste planning). It
  sits in the `core/io` layer next to `snapshot/` and reuses `validateSnapshot`,
  `records.ts`, `json-value.ts`, the codec registry and the limits from there. It never
  imports `core/space`.
- `src/core/edit/commands/`: the `Command` union gains `paste` and `duplicate`; `plan.ts`
  dispatches them to a `FragmentPlanner` injected through `PlanContext`, so `core/edit`
  still imports nothing from `core/io`.
- `src/core/graph-model.ts`: wires the fragment planner and gains two options,
  `payloadCodecs` and `fragmentLimits`. `src/core/index.ts` exports the new API.
- New view module `src/view/interact/clipboard/` (clipboard service, native-event bridge,
  paste placement). `builtin-commands.ts` and `keymap.ts` gain the four commands and
  chords. `dom-input.ts` lets the clipboard chords reach the browser and tracks the last
  pointer position. `view-editing.ts` and `mount-view.ts` wire the service and add a
  `clipboard` section to the view handle.
- `EditableModel` is unchanged: paste and duplicate are ordinary commands.
- Docs: `docs/guide-using-the-model.md`, `docs/guide-view.md`, `docs/interaction.md` (keymap
  table), `docs/format.md` (clipboard envelope); `examples/plain-js` gets export/import
  buttons.
- No new runtime dependencies. Core stays headless.
