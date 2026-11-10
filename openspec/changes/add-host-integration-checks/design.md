## Context

Each item is a claim the specs make or imply but no test pins down for an embedding host.
Existing mechanisms: per-type and per-entity style overrides, `captureRadiusPx` in
port layout, the `marquee` tool option (`direction`, `contain`, `intersect`; `direction` is the default and
contains left-to-right, intersects right-to-left), `SelectionModel.on`, `Keymap` bindings with a replaceable keymap
option, `cornerRadius` in the orthogonal router, `view.clientToWorld`, and the bench suites.
Since the view hardening: a node painter that draws `state.hovered` must declare
`repaintOnHover: true` (otherwise a hover change does not repaint the scene); a key binding
has `repeat` (default true; the default nudge, rotate, mirror and duplicate bindings set it
false so a held key acts once); shortcuts fall back to the physical key on non-Latin
layouts; a lost button release, a context menu before the drag threshold and a second touch
cancel a gesture; the root has the role `application` and a `label` mount option. The
names needed to write a tool are on `view/advanced`; `KeyBinding`, `Keymap`, `ToolOptions`
and the painter types are on `view`.

## Goals / Non-Goals

**Goals:** a verified answer per item; minimal fixes; each fix covered by a test naming its
rule in words; known limits written down.
**Non-Goals:** the items listed under Out of Scope in the proposal.

## Decisions

- D1 Verify-then-fix: every check is first a test or demo observation. A passing check stays as
  a regression test; a failing check gets the smallest fix and a note in `notes.md`.
- D2 Style: prefer existing per-entity overrides and a host style function over new model
  fields. A runtime change repaints only the scene layer. New API only if overrides
  cannot express dash/width/colour per connection. The painter-wrapper pattern copies
  `repaintOnHover` from the painter it wraps (or sets it when the wrapper itself draws
  hover), and the guide shows it; a wrapper that drops the flag would see `state.hovered`
  only when something else repaints the scene.
- D3 Echo filtering: selection events gain `origin: "user" | "api" | "model"`. Every
  selection call takes an optional `origin` argument that defaults to `"api"`, because a call
  made directly on the selection model or the view is by definition a program calling; the
  built-in tools pass `"user"` for what the user's pointer or keys did. The third value,
  `"model"`, is for selection that shrinks because entities left the model (a delete, a
  snapshot push, a reset): a host that drops its own `"api"` echoes must still hear that a
  selected entity disappeared, and it is not an echo of anything the host did. The origin is
  a field of the event that `view.on("selection")` already delivers (the view has one
  subscription style) and the React selection hook includes the origin of the last change
  in its snapshot. Tagging is enough; no suppression of the event. Selecting an ID the model
  does not contain is ignored without error and reports no change. Today the selection model
  drops unknown keys only at the next model change (`bindToModel` prunes on `change` and
  `reset`), and `apply` does not look at the model, so `apply` needs the model's reader: a
  task passes it in when the selection is bound.
- D3a Marquee: the `marquee` option already offers `direction` (default), `contain` and
  `intersect`. A host that wants partly covered nodes in both directions sets `intersect`;
  the default stays as it is. This change proves the three values with tests and adds a
  scenario to the selection rule; it changes no default.
- D4 Shortcut scope is per focused root, extended by an optional host predicate.
  Add unbinding and rebinding of any chord or command, and bare-key bindings, only if the
  `keymap` option cannot express them today. A text field's keys never reach graph commands.
  A host binding states `repeat` like the defaults; a host that rebinds nudge keeps one step
  per held key only if it sets `repeat: false`, and the guide says so.
- D6 Performance: record numbers for 50, 200 and 500 node fixtures, plus a 2000-node stress
  fixture, with the existing harness from the React Flow comparison rule; no new budgets unless the result is far outside
  the existing ones. The sizes are planning values to confirm against real documents.
- D8 Symbols: hosts hand over SVG data URIs of different sizes, already tinted. Each tint has
  its own asset key; the resolver returns the picture. Placement fractions use the picture's
  own coordinates, so no size is assumed.
- D9 Port normals: an explicit outward normal on a placement is optional. A host that knows
  each port's side gives it and it wins; without one the normal is derived from the nearest
  body edge, as today. Either way it rotates and mirrors with the anchor and the router
  leaves along it.
- D10 Fit on first content: the existing `initialFit` option gains one more setting (a field on its fit options) rather than a
  new option. The view watches the model until it holds a node, fits once, and stops watching;
  any viewport change made before then (user, host or explicit initial viewport) spends the
  fit without moving anything. Unmount removes the watcher.
- D11 Label hiding reuses the port-hiding mechanism: theme tokens holding a zoom below which
  the thing is not painted, evaluated by a small pure function beside `portsVisible`. Text is
  never scaled or clamped, because a clamped font breaks the match between what is drawn and
  what picking uses. Labels are paint only, so hit-testing is untouched.
- D13 Snapping: `gridStep` already exists as a tool option and is unset by default, so the
  work is to prove that, to prove run-time change through `setToolOptions`, and to remove the
  Alt override from moves and resizes. A per-gesture override made grid behavior depend on
  which key happened to be held and collided with Alt meaning docking suppression and the
  wire-end grip bypass. A host that wants free placement turns the grid step off. The docking
  modifier stays configurable (`DockingOptions.suppress`).
- D7 WebView, pen and touch: browser tests cover synthetic pointer events with
  `pointerType` pen and touch in Chrome, including the existing cancellations (`pinch` for a
  second touch, `button-released`, `context-menu`); real WebView runs are manual and
  recorded. Trackpad pinch and pan values are checked on a physical device in
  `close-archive-gaps`, not here.
- D14 External drop range: a drop position converted by `clientToWorld` is a world point;
  `createNode` refuses a position outside plus or minus 1e7 with `out-of-range` like any
  other edit, so the example needs no clamp of its own and reports the refusal.

## Risks / Trade-offs

- New requirements may turn out unnecessary; they are dropped in that case (see proposal).
- Synthetic pointer tests do not prove WebView behavior; recorded as a limit.

## Settled Questions

- Origin field: `origin: "user" | "api" | "model"` (D3).
- The benchmark reuses the harness from the React Flow comparison rule; no separate comparison setup.

## Open Questions

- Real host document sizes to replace the planning figures (50 to 500 typical, 2000 stress).
