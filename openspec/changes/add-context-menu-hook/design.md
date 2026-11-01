# Design

## Context

See proposal.md for the motivation. These are the parts of today's code this change
builds on:

- **Pointer buttons.** `pointer-input.ts` passes buttons 0, 1 and 2 to the router, and
  every built-in tool accepts only button 0 (and pan also accepts 1). So a right press is
  `IGNORED`, and `dom-input.ts` leaves its default alone ("Unclaimed presses (right
  button) keep the browser's default, e.g. the context menu"). The root is focused on
  every press, right presses included. Nothing listens for the DOM `contextmenu` event.
  On macOS a Ctrl+click arrives as a button-0 `pointerdown` with `ctrlKey` (Ctrl is not
  the primary modifier there), so select-move or connect enters `pressed` before the
  browser sends `contextmenu`.
- **Touch.** The root has `touch-action:none`. A touch press goes through the same
  router: the touch drag threshold is 6 CSS px against 3 for a mouse, and with the
  default `emptyDrag: "pan"` a drag on empty canvas pans and a drag on a node moves it
  (pan-first). A second pointer cannot start a gesture while one is active (no pinch
  yet). Nothing measures how long a press is held.
- **Router and gestures.** `createToolRouter` holds one gesture per pointer. It ends
  when the tool returns to idle, which releases capture. `dom-input.ts` runs no shortcut
  while `router.activePointer` is set. Its `cancel(reason)` is internal. `CancelReason`
  has no context-menu entry.
- **Commands.** `view.commands` exposes `run`, `availability`, `list` (`id`, `labelKey`
  in registration order) and `register`. Built-in commands act on the selection
  (`edit.delete`, `nodes.rotate`, `edit.copy`, …). `edit.paste` places the fragment at
  `deps.pointer()`, the last mouse or pen position over the view; there is none for
  touch.
- **Events.** The view handle has no general `on`. `view.clipboard.on(type, handler)`
  returns an unsubscribe function and is the only event API, so its shape is the model
  to follow.
- **Overlay.** `overlay-host.ts` anchors elements to a world point or a node, and
  `isOverlayContent` keeps overlay content from starting gestures. Keyboard events from
  non-text overlay content (a menu button) still bubble to the root's `keydown`. There
  `Escape` is bound to `selection.clear`, so pressing Escape in a host menu would clear
  the selection today.
- **File sizes.** `dom-input.ts` 298 lines, `mount-view.ts` 336, `view-editing.ts` 267,
  `examples/plain-js/main.ts` 276. New logic goes into new files.

## Goals / Non-Goals

**Goals:**

- A hook, no UI: a context-menu event with everything needed to build and place a menu.
- One code path for running a menu item: `view.commands.run`, so availability, patches
  and undo match the shortcuts.
- Without listeners, behavior is the same as today.
- Pure logic stays headless: target resolution, the selection rule and the long-press
  machine run in Node tests.

**Non-Goals:**

- Menu or submenu components, menu keyboard navigation, or focus trapping.
- A command query for targets other than the selection.
- Connection choices (`add-connection-chooser`).

## Decisions

## Decisions

### D1. The context-menu event is `view.on("context-menu", handler)`

```ts
interface ViewEventMap { "context-menu": ContextMenuEvent }
on<K extends keyof ViewEventMap>(type: K, handler: (e: ViewEventMap[K]) => void): () => void;
```

A small typed emitter (`src/view/interact/input/view-events.ts`) holds listeners in
insertion order, reports `count(type)`, isolates a throwing handler (the others still
run, and the error is rethrown asynchronously, as the clipboard events do), and is
cleared on dispose. The DOM side asks `count("context-menu") > 0` to decide whether to
suppress the browser's menu and arm long-presses.

Why: it matches `view.clipboard.on` and `selection.on` (same return value). It lets
several parts of a host listen, for example a menu and an analytics hook, and lets a
host subscribe and unsubscribe after mount.

Alternatives considered:

- **A mount option `onContextMenu`** (React Flow style). It allows one handler only, set
  at mount. The react slice can map a prop onto `on` later.
- **Dispatching a DOM `CustomEvent` on the root.** It is untyped, ties the payload to
  the DOM, and makes "is anyone listening?" impossible to answer, which the suppression
  rule needs.

### D2. Payload: plain data, no DOM event

```ts
type ContextMenuTarget =
  | { kind: "node"; node: NodeId }
  | { kind: "port"; node: NodeId; port: PortId }
  | { kind: "connection"; connection: ConnectionId; member?: string }
  | { kind: "canvas" };
interface ContextMenuEvent {
  readonly target: ContextMenuTarget;
  readonly hits: readonly HitCandidate[];          // empty for keyboard invocation
  readonly selection: { readonly nodes: readonly NodeId[]; readonly connections: readonly ConnectionId[] };
  readonly invocation: "mouse" | "pen" | "touch" | "keyboard";
  readonly modifiers: Modifiers;
  readonly client: { readonly x: number; readonly y: number };
  readonly viewport: Point<"viewport">;
  readonly world: Point<"world">;
}
```

The target is the first hit of the view's normal pick at that point, the same pick and
order that `view.pick` and the tools use (ports hidden at low zoom stay unpickable,
the level of detail rule), so a menu and a click always agree. `hits` lets a host offer "which one?" for
coincident paths. `selection` is in selection order, after D3. The three
positions save the host from converting: `client` for host DOM outside the view,
`viewport` for an overlay `viewport` anchor (D7), and `world` for a world anchor or for
"create/paste here". The DOM event is not exposed. Keyboard and touch invocations have
none that means anything, and a typed payload keeps hosts off browser quirks. A host
that needs a DOM detail can listen on `view.element` itself.

### D3. Selection rule: select-on-open for unselected entities

A pointer or touch invocation applies `{ mode: "replace", keys: [key] }` when the target
entity (a port's node for a port) is not selected. It leaves the selection alone when the
target is already selected or is the canvas. Modifiers do not change the rule. Keyboard
invocation never changes the selection.

Why: built-in commands act on the selection, so after this rule a menu item is exactly
`view.commands.run(id)`, with the same availability text as the shortcut. This is what
most desktop editors and file managers do. Keeping a multi-selection when the click lands inside it is what makes
"delete these three" possible from a menu. The rule runs only when a listener exists, so
a host without a menu sees no change.

Alternatives considered: **never select** (React Flow). The host must then pass the
target to every command, which needs a second, target-based command API (the gap
the unified commands rule would otherwise need), and the selection highlight disagrees with what the menu
acts on. **Select also on empty canvas (clear)**. That loses a selection the user may
want to "paste here" next to, or align, so it is rejected.

### D4. Pointer triggers and gesture interplay

`src/view/interact/context-menu/context-menu-input.ts` attaches at mount and
listens on the root for `contextmenu`, `pointerdown`/`pointermove`/`pointerup`/
`pointercancel` (to track the current press and long-presses), and `keydown` (D6):

- **Right-click.** `contextmenu` is the only trigger for mouse and pen. It already covers
  the secondary button, Ctrl+click on macOS and a pen barrel button, and it fires on
  press on macOS and on release on Windows. Both timings work because a right press
  starts no tool.
- **Scoping.** An event whose target is overlay content or a text field is ignored with
  its default kept.
- **No listener.** Return before anything else: no `preventDefault`, no selection
  change, no cancel.
- **Active press.** If the router has a gesture on the same pointer that has not moved
  past its drag threshold (tracked here from the press point, with the same
  `dragThreshold` helper), the gesture is cancelled with the new `CancelReason`
  `"context-menu"` through a new `DomInput.cancelGesture(reason)`. A `pressed` state
  emits no effects on cancel, so the macOS Ctrl+click neither selects on release nor
  drags. If the gesture has passed the threshold, the event is not raised and the native
  menu is suppressed, so a drag is never disturbed.
- Then the selection rule (D3) runs, `preventDefault()` is called, and the event is
  emitted.

`dom-input.ts` needs only `cancelGesture` and the overlay keyboard gate of D7. To stay
under 300 lines it first moves its key handling into a new `input/key-input.ts`, as a
pure refactor in its own commit.

### D5. Touch long-press is a pure state machine beside the router

```ts
type LongPressState =
  | { kind: "idle" }
  | { kind: "armed"; pointerId: number; start: Point<"viewport">; at: Point<"world"> }
  | { kind: "fired"; pointerId: number };    // swallow the rest of this touch
// inputs: down(touch) | move | up | cancel | second-down | timeout | native-contextmenu
```

`long-press.ts` is DOM-free: it says when to start or clear the timer and when to fire.
`context-menu-input.ts` runs the timer with the root window's `setTimeout`, which it
reads at mount. Rules:

- Arm only for `pointerType === "touch"`, only while a listener is registered, and only
  when `longPressMs !== false` (a new `ToolOptions.longPressMs`, default 500, the
  common platform value).
- **Pan-first compatibility.** Movement beyond the *touch drag threshold* (the same 6 px
  the tools use) disarms. So the two outcomes are exclusive by construction: before the
  threshold the gesture is still `pressed` and nothing has moved; after it the tool is
  panning, moving or connecting and the long-press is gone. A drag that starts after the
  long-press fired does nothing, because the router gesture was cancelled.
- A second touch (`pointerdown` with another ID) disarms, so a future pinch never opens a
  menu. `pointerup`, `pointercancel`, blur, hidden and dispose disarm.
- On fire: cancel the router gesture (`"context-menu"`), apply D3, and emit with
  invocation `touch` at the press point.
- Chrome on Android also sends a native `contextmenu` for a long touch. iOS Safari sends
  none. While a touch is armed or fired, a native `contextmenu` from it is
  default-prevented. If it arrives before our timer, it counts as the fire (one event).
  After our fire, it is swallowed. So the host gets exactly one event on every platform,
  and the timer covers Safari.
- `layer-stack.ts` adds `-webkit-touch-callout:none; user-select:none;
  -webkit-user-select:none` to the root, so iOS shows no callout or text selection
  during the hold. Overlay content can set its own `user-select`.

Pen long-press is not armed, because pens report their barrel button through
`contextmenu` (user decision, Resolved Questions).

### D6. Keyboard invocation

The menu key (`key === "ContextMenu"`) and Shift+F10 on the root's `keydown`, when
`shouldHandleKey` allows it, the target is not overlay content, no gesture is active, and
a listener exists. Then:

- The target is the primary selected entity (`selection.primary()`): a node or a
  connection, or the canvas when nothing is selected. Ports are never selected, so a
  keyboard target is never a port.
- The position is the centre of the entity's world bounds from the geometry scene,
  clamped into the visible world rectangle, or the view centre for the canvas. It is
  converted to viewport and client coordinates.
- The selection is not changed. `preventDefault()` runs on the `keydown`.
- Windows sends a native `contextmenu` after the menu key, and Chrome does after
  Shift+F10. A flag set by our handler swallows the next native `contextmenu` (cleared
  on `keyup` plus one task), so one key press gives one event.

The key handling sits in `context-menu-input.ts`, not in the keymap, because it is not a
command: its result is an event with a position, not a patch.

### D7. Small host-menu gaps

- **`edit.paste` with `at`.** `PasteArgs` gains `at?: Point<"world">`, and
  `clipboardService.paste(text?, at?)` uses it before `deps.pointer()`. Availability is
  unchanged.
- **Overlay `viewport` anchor.** `OverlayAnchor` gains
  `{ kind: "viewport"; point: Point<"viewport"> }`. Layout uses the point as is (no
  scale option), so a host menu at `event.viewport` stays on screen while the view
  zooms. World and node anchors are unchanged.
- **Overlay content runs no graph shortcuts.** In the keyboard handler (moved into
  `key-input.ts`), a `keydown` whose target is overlay content runs neither tool keys nor
  the keymap. `attachClipboardEvents`'s `owns` also ignores overlay content. Text fields
  were already excluded. This extends the exclusion to non-text host controls, so Escape
  or Delete in a host menu never reaches the graph.
- **No new registry query.** With D3, `commands.list()` gives IDs and label keys in
  registration order, and `commands.availability(id, args)` gives enabled state and the
  reason. The demo shows building a menu from those two. A target-based query would
  duplicate every command's availability logic.

### D8. Files and layering

| Layer | New or changed file |
| --- | --- |
| view/platform | `dom/layer-stack.ts` (touch callout, user-select) |
| view/interact | new `context-menu/context-menu-types.ts`, `context-target.ts` (target from hits, D3 rule, keyboard placement), `long-press.ts`, `context-menu-input.ts`; new `input/view-events.ts`, `input/key-input.ts`; changed `tools/tool-types.ts` (`"context-menu"` reason), `thresholds.ts` (`longPressMs`), `input/dom-input.ts`, `overlay/overlay-host.ts`, `clipboard/clipboard-commands.ts`, `clipboard/clipboard-service.ts`, `clipboard/clipboard-events.ts` |
| view/mount | new `view-context-menu.ts` (event emitter and context-menu input, wired from `view-editing.ts`); `view-types.ts` (`on`); `mount-view.ts` (one delegating member); `index.ts`, `advanced.ts` |

`src/view/interact/` already matches every subfolder in `src/architecture.test.ts`, so
the new `context-menu/` folder needs no table change. `view-context-menu.ts` is a new
mount-layer file and is added to the mount rows deliberately. `mount-view.ts` grows by
about two lines (336 → about 338), the same accepted exception as before (the user treats
300 as a soft guideline).

### Flows

```mermaid
sequenceDiagram
  autonumber
  participant U as User
  participant C as context-menu input
  participant R as router
  participant S as selection
  participant H as host listener
  participant M as model
  U->>C: contextmenu (right-click on node B)
  C->>C: listener? not overlay or text? not dragging?
  C->>R: cancelGesture("context-menu") if a press is below threshold
  C->>S: replace with B (B was not selected)
  C->>H: emit context-menu {target node B, selection [B], positions}
  C-->>U: preventDefault (no browser menu)
  H->>H: build items from commands.list() + availability(id)
  U->>H: click "Delete"
  H->>M: view.commands.run("edit.delete")
  M-->>U: one history entry (undo as for the shortcut)
```

## Risks / Trade-offs

- [Browsers differ in when and whether `contextmenu` fires (macOS on press, Windows on
  release, iOS never for touch, Chrome Android on long touch)] → D4 and D5 treat
  `contextmenu` as one input among several and dedupe per pointer or key press. Browser
  tests cover the paths that Chrome can drive, and the Safari and iOS paths go through
  the pure long-press machine.
- [Select-on-open changes the selection a user had] → Only when a listener exists and
  only for an unselected target; inside a selection nothing changes.
- [A long hold to read a node, without wanting a menu, opens one] → Only with a
  listener, and `longPressMs: false` turns it off.
- [Overlay content no longer runs graph shortcuts] → Intended. A host that wants a
  shortcut inside its overlay UI can call `view.commands.run` itself.

## Migration Plan

Additive. Host code with an exhaustive `switch` over `CancelReason` or
`OverlayAnchor["kind"]` needs one more branch. `PasteArgs`, `ToolOptions` and `ViewHandle`
gain members. Keyboard events from non-text overlay content no longer reach the graph
keymap. No data migration, and the snapshot format is unchanged.

## Resolved Questions

Answered by the user on 2026-11-01, before the proposal:

- **No shipped UI.** The library ships no menu, only hooks, "the most canonical way"
  (like React Flow's `onNodeContextMenu` / `onPaneContextMenu`, or Cytoscape's separate
  menu plugin). In the user's words, "menu must be customizable. or the user of the
  library would put own menu on top of our nodes, we just need to hook up the click
  event".
- **Context-menu hook.** An event on the view (D1). It fires on right-click
  (`contextmenu`), touch long-press, and the menu key or Shift+F10 with focus. Keyboard
  invocation targets the selection and is placed at it. The payload has the hit by
  stable IDs from geometric picking, the selection, and client, viewport and world
  positions. The native menu is suppressed only when at least one listener is
  registered. Nothing fires in overlay text fields. The hook must not start or
  disturb a gesture, and a right press must not start pan or drag tools.
- **Select on right-click.** The user's recommendation was to select an unselected
  entity first, as most editors do. Adopted as D3, with the multi-selection and canvas
  refinements.
- **Menu items are commands.** Hosts build items from the command registry and run them
  with `view.commands.run(id, args)`, and undo works as for shortcuts. Hosts place their
  DOM through the overlay (world or screen anchor) or by the event coordinates. The
  small gaps found are paste-at-position and the viewport anchor (D7).
- **Demo.** The plain-js demo gets a small example context menu as example code,
  application-neutral.

Answered by the user on 2026-11-01, after reviewing the proposal:

- **Modifiers on right-click.** Shift+right-click (or any modifier) on an unselected
  entity behaves like a plain right-click: it selects just that entity. Modifiers stay in
  the payload (D3).
- **Browser menu pass-through.** There is no per-event pass-through. The browser's menu
  is suppressed while any listener is registered (D4).
- **Long-press devices.** Touch only, not pen (D5).

Answered by the user on 2026-11-01, before implementation:

- **Separate change.** "Context menu is a separate concern, has nothing to do with
  connections." The connection-choice hook moved to `add-connection-chooser`; this change
  neither needs nor knows about it.

No open questions remain.
