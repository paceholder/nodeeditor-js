# Design

## Context

How the code works today:

- `src/view/view-editing.ts` builds the keymap from `input.keymap` (or `DEFAULT_KEYMAP`)
  once at mount. On a key-down, a binding marked `native: true` (Mod+C, Mod+X, Mod+V)
  returns `"native"`. The key-down is not default-prevented, so the browser fires its
  clipboard event. Any other binding runs `commands.run(id, args)` at once.
- `src/view/interact/clipboard/clipboard-events.ts` (the bridge, internal) listens for
  `copy`, `cut` and `paste` on the document. While focus is in the root and not in a text
  field or overlay host content, it runs `edit.copy`, `edit.cut` or `edit.paste` through
  `commands.run`. It never looks at the keymap. This is the defect: with Mod+X unbound,
  the key-down resolves to nothing, the browser still fires `cut`, and the bridge runs
  `edit.cut`, which deletes the selection. The browser's Edit menu and the Windows
  Shift+Delete, Ctrl+Insert and Shift+Insert chords reach the same bridge.
- `createCommandRegistry` keeps one command per ID. `register` with an existing ID
  replaces the earlier command and emits `"availability"`. Its remover deletes the ID only
  if the stored command is still its own, so the built-in is not restored. The bridge,
  the keymap and host menus all go through `commands.run`. A host command registered
  under `edit.paste` therefore already gets the shortcut, the native event (with
  `{ text }`) and the menu (with `{ at }`), and the clipboard service is never called.
  No spec and no test promise this, and no doc describes it.
- The lock check is in `registry.run`: a replacement without `allowWhenLocked` is refused
  while the view is locked, like any host command.
- The built-in paste places the fragment at `input.pointerWorld()`. That value is set by
  mouse and pen `pointermove` on the root, cleared on `pointerleave`, and converted to
  world coordinates when read. A host command cannot read it. `CommandContext` has
  `model`, `reader`, `selection` and `view`.
- Delegated creation on the snapshot model (`nodeCreation: "delegated"`) sends a built-in
  paste or duplicate to the host as a `create-fragment` intent: the planner extracts a
  fragment from the read model, encodes and validates it, and turns it into
  fragment-local keys (`src/core/io/fragment/plan-paste.ts`, `plan-delegated.ts`). For a
  paste this is right: the fragment came from the system clipboard, maybe from another
  client. For a duplicate it is wasteful: the backend already holds the records and
  could copy them by ID in one operation, with data the snapshot may not carry.
- Copy and paste stay on the client. The fragment is serialized JSON on the system
  clipboard, so many clients can exchange it with no copy buffer on a server. This
  change keeps that.

## Goals / Non-Goals

**Goals:** the keymap alone decides what the keyboard and the browser's clipboard events
run; one documented, tested way for a host to take over copy, cut, paste and duplicate on
every route; the pointer position available to a host command; a duplicate of a
host-named document done by the host as one operation from IDs; no new exported names.

**Non-Goals:** disabling arbitrary commands by ID; restoring a built-in when its
replacement is removed; a React hook for host commands; a server-side copy buffer;
changing local duplicate or delegated paste; the WebKit event problem
(`fix-safari-clipboard`); creation capabilities and external drops.

## Decisions

### D1. The bridge runs a command only if the keymap binds it

The bridge gets a predicate `bound(id): boolean`. `view-editing.ts` computes it from
`keymap.bindings.some((b) => b.command === id)`. The keymap is fixed for the life of a
mount, so the result can be computed once at attach time. When the command of an event's
type is not bound, the handler returns before `deps.run` and before `preventDefault`, so
the browser's default action happens: on a non-editable root it does nothing. A host
that stops these events in the capture phase today can drop that code.

"Bound" means any chord, with or without `native: true`. Reasons:

- Platform clipboard chords that the keymap does not list (Shift+Delete, Ctrl+Insert,
  Shift+Insert on Windows and Linux) and the Edit menu keep working while the command has
  a shortcut, as they do today.
- A host that binds `edit.copy` to a chord without `native` runs it from the key-down.
  The key-down is then default-prevented, so the browser fires no event for that chord
  and the command does not run twice.
- With no binding at all, nothing on the keyboard or the Edit menu runs the command. That
  is the reading of "the keymap is the single source of truth" that the host expected.

The bridge is internal (`attachClipboardEvents` is on the removed-names list of
`scripts/public-surface.test.ts`), so the new dependency adds no public name.

Alternatives considered:

| Alternative | Why not |
| --- | --- |
| `input.clipboard: false` removes the clipboard bindings and the bridge | A second switch next to the keymap that can disagree with it; it turns the feature off, while the host wants it routed; it adds an option to classify in the React wrapper. |
| Run a native event only when the chord just pressed is a `native` binding | The Edit menu and the platform's other clipboard chords send no matching key-down. This would break them with the default keymap and needs timing state between key-down and event. |
| Drop the bridge and run the commands from the key-down with the async Clipboard API | Paste prompts or shows a paste button in every browser. This reverses the settled "native route" decision in `docs/interaction.md` and conflicts with `fix-safari-clipboard`. |
| Map each event to the command of whatever binding is `native` | An event has no chord, so the mapping is ambiguous. See D4. |

### D2. Taking over a clipboard command is replacing it by ID

A host routes copy, cut, paste or duplicate to its backend with the registry it already
has:

```ts
view.commands.register({
  id: COMMAND_IDS.paste,
  labelKey: "command.edit.paste",
  availability: () => ({ available: true }),
  run(args, ctx) {
    const at = (args as { at?: Point<"world"> } | undefined)?.at ?? ctx.pointer;
    host.requestPaste(at);           // the backend creates; the host pushes the snapshot
    return { ok: true, value: { changed: false } };
  },
});
```

The library creates nothing because the clipboard service is reached only through the
built-in command. Copy and cut keep receiving `{ sink }` from a native event, so a host
may put its own text (for example a reference its backend understands) on the system
clipboard synchronously. `{ changed: false }` is the right result for a request whose
effect arrives later through a push. The spec turns today's behaviour into a requirement
with tests, and the guide gets a recipe for it.

Alternatives considered:

| Alternative | Why not |
| --- | --- |
| A handler option, `input.clipboard.handler(request)` with a `ClipboardRequest` type | Two or more new public names, and a second path next to the registry for the same four IDs. Menus would still run the built-in commands unless the handler also replaced them. |
| A `"clipboard-request"` view event while the built-in does nothing | Needs a mode switch to say "do nothing", plus an event type and payload, so new names. An event cannot report availability, which menus read. |
| `commands.disable(id)` or `unregister(id)` on the handle | A new method on the public handle. It only turns a command off and does not route it. Unbinding (D1) plus replacing (D2) covers both cases. |
| Delegated creation only | It carries the library's fragment for paste, which is what a multi-client paste needs; D5 adds the ID-based duplicate. A host that wants its own copy and paste too replaces the commands. |

The remover of a replacement deletes the ID and does not bring the built-in back (owner
decision). A host that wants the built-in again remounts the view. This keeps the
registry as it is and gives "remove" one meaning.

### D3. The pointer goes in the command context

`CommandContext` gains `readonly pointer?: Point<"world">`. The view's context factory
fills it from `input.pointerWorld()` when it builds the context for a run or an
availability query. That is the point the built-in paste uses: set by mouse or pen over
the root, absent after the pointer leaves, absent without input. Touch leaves it absent,
and a touch menu passes `{ at }` instead, as today. The field is optional, so contexts
built by `createCommandRegistry` users from `view/advanced` still compile. It adds no
exported name.

Alternatives considered: let the bridge or the keymap add `at` to the arguments. This
would change the built-in paste, because `{ at }` centres the fragment there and skips
the cascade for repeated pastes. Expose `view.pointer()` on the handle: a new public
member that hosts can do without, since they can already follow `pointermove` with
`clientToWorld`. Pass the pointer as a function rather than a value: the context is built
fresh for each run, so a value is enough and simpler.

### D4. `native: true` applies only to copy, cut and paste

A binding's `native` flag means "let the browser fire its clipboard event and run the
command from it". Only `edit.copy`, `edit.cut` and `edit.paste` have such an event. On a
binding for any other command the keymap ignores the flag: the key-down resolves as an
ordinary binding, is default-prevented and runs that command (owner decision). Before,
such a binding returned `"native"` and the event ran the built-in clipboard command of the
event's type, never the bound one. The flag is documented as clipboard-only in the
`KeyBinding` comment and `docs/interaction.md`. Throwing at mount was rejected: a flag that
has no meaning is harmless, and throwing would make a keymap fail for a cosmetic reason.

### D5. A host-named duplicate is one `duplicate` intent with IDs

`DelegatedIntent` gains a member:

```ts
interface DelegatedDuplicate {
  readonly kind: "duplicate";
  readonly operationId: OperationId;
  readonly nodes: readonly NodeId[];             // each once, paint order
  readonly connections: readonly ConnectionId[]; // what the copy re-creates, creation order
  readonly groups?: readonly GroupId[];          // groups to copy, creation order; omitted when none
  readonly offset: Vec2;                         // the local duplicate's offset
}
```

The fragment planners' `duplicate` checks `ctx.delegation` first. With delegation it
does not call `extractFragment` and builds no fragment. It reads the records directly:

- **Nodes**: the listed IDs, each once, sorted by paint order (`z`, then insertion
  order), as the fragment would have them.
- **Connections**: every connection with both ends on listed nodes, which is what a local
  duplicate copies. Under `external: "preserve"` also every connection with one end on a
  listed node, the same set a local duplicate tries to keep; the host keeps the outside
  end. Under the default `exclude` those are left out and reported in the plan's
  `excluded` with reason `external`, as for a local duplicate. One list is the minimum:
  the host tells internal from external by the endpoints, which it has.
- **Groups**: a local duplicate copies each listed group (the selected frames) with all
  its members, and a copied node joins the copy of its group only when that group is
  copied; a member selected without its frame becomes a free node. The intent therefore
  carries the listed groups' IDs, each once in creation order, and their members are
  added to `nodes`. The host copies each listed group, puts the copy of a node into the
  copy of its group when that group is listed, and leaves every other copy free. Omitted
  when no group is copied, like `groups` of the create-fragment intent. Without this field
  the host could not tell a copied frame from a member duplicated on its own. A missing
  group is refused with `unknown-entity`.
- **Offset**: `placement.by` for an offset placement (the view's duplicate always uses
  one: one paste step). For `center` it is the point minus the centre of the nodes'
  frames, computed with the same `fragmentBounds` the fragment path uses, from the node
  records instead of snapshot entries.
- **Checks**: no node listed and no group with members (`empty-fragment`), a missing
  node or group (`unknown-entity`), an
  unregistered or non-creatable type (`unknown-type`, `not-creatable`), and, in
  `api.ts` as for every delegated plan, `creationRefusal` (read-only mode). The view's
  lock refuses the command in the registry, as before. Payload codecs and fragment size
  limits do not apply: they guard untrusted text and encoding for the clipboard, and here
  nothing is encoded and the IDs come from the read model.

The snapshot adapter accepts the new kind in `delegate`. It settles like a fragment:
accepted needs no node ID, rejected carries the host's rejection unchanged, unknown and
the timeout follow the creation rules. **No placeholder** (owner's minimum): the
adapter's `placeholders()` lists none for a duplicate, so the view paints nothing until
the pushed snapshot brings the copies. A placeholder would need positions and types,
which is what the intent avoids carrying; the copies usually arrive with the push that
follows the answer. The view's duplicate result is pending with nothing created, so the
selection stays on the originals, as for a delegated paste today.

`DelegatedDuplicate` is not exported by name, like the other members: hosts narrow
`DelegatedIntent` by `kind`. No new public name. `checkTypes` moves out of
`plan-paste.ts` into its own file so the new planner file can share it without an import
cycle.

Alternatives considered:

| Alternative | Why not |
| --- | --- |
| Keep `create-fragment` for duplicate and add the source IDs to it | The fragment is still built, encoded and validated, and the host gets two descriptions of the same copy. |
| Node IDs only, the host finds the connections | The host would have to repeat the library's rule for which connections a duplicate copies, and `external: "preserve"` could not be expressed. |
| Separate lists for internal and preserved connections | Two fields for what the endpoints already say. |
| Show placeholders at the offset positions | Needs types and positions in the intent or a second read; the copies arrive with the next push anyway. Can be added later without changing the intent. |
| A duplicate on the client followed by a submitted patch | The client cannot name the nodes on a host-named document; that is why delegation exists. |

## Risks / Trade-offs

- [A host that unbound Mod+X but relied on the Edit menu or Shift+Delete still cutting]
  → that is the defect being fixed. `CHANGELOG.md` states it, and the remedy is to keep a
  binding.
- [A host's replacement is lost on remount] (the React wrapper remounts when `keymap`,
  `tools`, `platform` or `clipboard` change identity) → the guide recipe registers in an
  effect keyed on the view, like any host command.
- [Removing a replacement leaves no command under that ID] (the registry does not restore
  the built-in) → owner decision, documented. A host that wants the built-in back
  remounts.
- [A host on delegated creation that handles `create-fragment` for both paste and
  duplicate] → its duplicate now arrives as `duplicate`. TypeScript flags an exhaustive
  switch; a host with a default branch must add the case. `CHANGELOG.md` states it.
- [The copies arrive after the answer] → the view shows nothing new until the push; the
  host should push promptly. The timeout and unknown rules still cover a lost push.
- [`fix-safari-clipboard` lands in either order] → its proxy is focused only on a
  `native` chord's key-down. A chord the host unbound never resolves, so the two changes
  compose. Whichever lands second runs the other's browser test.
- [`add-host-integration-checks` adds a host predicate to the shortcut focus scope] → if
  it lands, the bridge's ownership check should use the same predicate. This is a task
  of that change, noted here so it is not missed.

## Migration Plan

No data or format migration. Hosts that stopped `copy`, `cut` and `paste` in the capture
phase can remove that code after upgrading. Hosts on delegated creation add a case for
the `duplicate` intent (or reject it with `unsupported-command`). Rollback is reverting
the bridge predicate and the duplicate planner branch.

## Open Questions

None. The owner answered the earlier ones: the remover does not restore the built-in
(D2), `native: true` is ignored outside the clipboard commands (D4), and there is no React
hook (the guide recipe uses an effect).
