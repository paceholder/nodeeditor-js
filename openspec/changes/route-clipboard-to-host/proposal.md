## Why

The view runs `edit.copy`, `edit.cut` and `edit.paste` from two places: the keymap and the
browser's native `copy`, `cut` and `paste` events, which a listener on the document turns
into the same commands whenever focus is in the view's root. The second route ignores the
keymap. A host that removed the Mod+X binding still lost the selection on Ctrl+X, because
the browser fired `cut` and the bridge ran `edit.cut`, which deletes. The host had to stop
the events in the capture phase on its own wrapper. The keymap does not decide what the
keyboard does, which is a defect.

Hosts whose backend owns the document also want copy, cut, paste and duplicate to stay on
the usual keys and menu items. Copy and paste keep working on the client: the fragment is
serialized JSON on the system clipboard, so several clients can copy and paste between
each other without a copy buffer on a server. Duplicate is different: it copies what is
already in the backend, so the backend should do it as one atomic operation from the IDs
of the selected nodes. Today a document whose host names nodes (delegated creation) sends
a duplicate as a full fragment, the same shape as a paste, which makes the backend rebuild
records it already has. The command registry can already replace a built-in command by
its ID, but nothing guarantees that a replacement covers every route (keys, native
events, menus), and a replacement cannot find out where the pointer is.

## What Changes

- **The keymap decides the clipboard events.** A native `copy`, `cut` or `paste` event runs
  its command only when the view's keymap binds some chord to that command. If the host
  unbinds it, the event runs nothing and keeps the browser's default. This applies to
  events from the keyboard and from the browser's Edit menu. With the default keymap
  nothing changes.
- **`native: true` is for the clipboard commands only.** On a binding for any other
  command the flag is ignored: the key-down runs that command like any other binding.
- **A replaced clipboard command handles every route.** A command registered with
  `view.commands.register` under `edit.copy`, `edit.cut`, `edit.paste` or `edit.duplicate`
  replaces the built-in one for the shortcut, the native event and any menu that runs the
  ID. The library's own clipboard is then not used for that command. Removing the
  replacement leaves the ID empty; the built-in does not come back until a remount. This
  already works in the code; the change states it as a requirement, tests it and
  documents it.
- **The command context reports the pointer.** `CommandContext` gains an optional
  `pointer` field: the world position of the pointer while it is over the view, the same
  point the built-in paste uses. The field is optional, so contexts that hosts build for
  `createCommandRegistry` keep compiling.
- **Duplicate of a host-named document is one host operation.** Under delegated creation
  the duplicate command hands the host a new `duplicate` intent in the `DelegatedIntent`
  union: the selected node IDs, the IDs of the connections the copy re-creates, the IDs
  of the selected groups (copied with all their members), and the offset the library
  would have used locally. No fragment is built. The host sends the
  IDs to its backend, the backend inserts the copies, the host pushes a snapshot and
  answers accepted, rejected or unknown (no node ID). No placeholder is shown. Local
  duplicate and delegated paste (the fragment intent) do not change.
- **Docs.** `docs/interaction.md`, `docs/guide-view.md` (keymap rule, "route the
  clipboard to the host" recipe), `docs/guide-host-authority.md` (the duplicate intent)
  and an "Unreleased" section in `CHANGELOG.md`.
- No new exported names. **BREAKING** for a host on delegated creation: a duplicate now
  arrives as a `duplicate` intent, not a `create-fragment` intent, and a host that
  switches exhaustively over `DelegatedIntent.kind` must add the new case. Nothing changes
  for a host on the default keymap and local creation. A host that unbound a clipboard
  chord and relied on the native event still running the command loses that path, which
  is the fix.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `interaction`: adds "Clipboard events follow the keymap", "Native clipboard bindings
  are only for copy, cut and paste", "Host handled clipboard commands" and "Pointer
  position in the command context". They refine "Unified
  commands" (one command per ID for every route) and "Keyboard editing shortcuts" (which
  keys run the clipboard commands).
- `model-adapters`: modifies "Paste, duplicate and unavailable creation" (only paste
  sends a fragment intent now) and adds "Duplicate of a host-named document is one host
  operation", "Contents of a duplicate intent", "Groups in a duplicate intent" and "A
  duplicate is checked before it is handed over". The modified requirement comes from the change
  `add-snapshot-sync-adapter`, which must be archived before this one.

Out of scope:
- A switch or API that disables any built-in command by ID, or a remover that restores
  the built-in. Replacing or unbinding covers the need.
- A React hook that registers a host command for the life of the view. The guide recipe
  uses an effect.
- A copy buffer on a server, or copy and paste done by the backend: copy and paste stay on
  the client with the system clipboard.
- A model-wide capability default that refuses creation up front and a drop target for
  external content.
- The hidden editable element that makes the native events fire in WebKit
  (`fix-safari-clipboard`). That change focuses its proxy only for a bound native chord,
  so it fits this rule.

## Impact

- Code: `src/view/interact/clipboard/clipboard-events.ts` (the bridge asks whether a
  command is bound), `src/view/view-editing.ts` (passes that check to the bridge and the
  pointer to the command context), `src/view/interact/commands/command-registry.ts`
  (optional `pointer`), `src/view/interact/commands/keymap.ts` (`native` only for the
  clipboard commands), `src/core/edit/intents/delegated-types.ts` (the `duplicate`
  intent), `src/core/io/fragment/` (a planner for the delegated duplicate),
  `src/core/io/sync/` (accept the intent, no placeholders), `examples/host-authority/`.
- Public API: no new names. `CommandContext` gains an optional field; `DelegatedIntent`
  gains a member. The public-surface ceilings do not change.
- Tests: `src/view/interact/clipboard/clipboard-events.browser.test.ts`,
  `src/view/clipboard.browser.test.ts`, `src/view/commands-api.browser.test.ts`,
  `src/view/interact/commands/keymap.test.ts`, `src/core/edit/commands/create-node.test.ts`,
  `src/core/io/sync/snapshot-create.test.ts`, `src/view/interact/clipboard/delegated-paste.test.ts`.
- Docs: `docs/interaction.md`, `docs/guide-view.md`, `docs/guide-host-authority.md`,
  `CHANGELOG.md`.
