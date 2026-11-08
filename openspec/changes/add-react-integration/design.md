# Design

## Context

`ViewHandle` already exposes `viewport.get`, the selection readers, `commands.availability`,
`overlay.attach` (anchor kinds `world`, `node` top-left, `viewport`) and `on("context-menu")`
(`ViewEventMap`). The model side offers `change`/`reset` events, readers and
`historyState()`. `FitOptions` (`paddingPx`, `maxZoom`) exist in
`src/view/interact/commands/view-fit.ts`; zoom clamping is a core-wide `clampZoom`.
`src/react/index.ts` is a re-export. React 19 is an optional peer dependency. The react
layer (rank 9) reaches core only through `src/core/index.ts` and the view through its
entry points.

## Goals / Non-Goals

**Goals:** thin React bindings with no second source of truth; stable snapshots; zero
work at import time; render-count tests proving granularity.
**Non-Goals:** React inside nodes; a UI kit; changing tool behaviour.

## Decisions

### D1. Mount component owns the handle; effects create, cleanup disposes
`<NodeEditor model options>` renders one container div and creates the view in an effect,
disposing in cleanup. Strict Mode's setup, cleanup, setup yields one live view and one set
of listeners because cleanup disposes fully and the second setup mounts a fresh view.
The handle is held in state exposed through the provider; hooks tolerate "not yet
mounted" by returning inert defaults. Options that have runtime setters (`theme` via
`setTheme`, `locked` via `setLocked`, `input.toolOptions` via `setToolOptions`) are applied
in effects without remount. Options without setters (`model`, `geometry`, `routes`,
`painters`, `input` tool list) are compared by identity and a change remounts the view; the
docs say to memoize them. Every option is classified in one total map typed over the
view's option keys, so adding an option forces a decision (update, remount or read once).
Lock changes made inside the editor reach the host through `onLockedChange`. Alternative considered: keeping
the view alive and diffing every option; rejected, it would need setters the view
deliberately lacks.

### D2. Hooks are `useSyncExternalStore` over narrow subscribe functions
Each hook has a `subscribe` and a cached `getSnapshot` that returns the same object while
the underlying value is equal. Everything that can be followed arrives through the one
`view.on` channel (`"viewport"`, `"selection"`, `"hover"`, `"lock"`), and a generic hook,
`useEditorState(read, events, { fallback, isEqual })`, wraps the subscribe-and-cache pair
so the built-in hooks are a few lines each and a host can follow its own state the same
way. The old `viewport.on` and `selection.on` were removed (pre-release, no consumers):
two subscription styles meant every hook hand-wrote its own plumbing.
- selection: the `"selection"` view event, snapshot `{ nodes, connections, primary }` with real IDs and the primary
  entity's kind; the view's internal key encoding does not reach the host;
- viewport: `ViewportState` has no event today, so the view gains a coalesced
  `"viewport"` event (at most once per animation frame, never per pointer
  sample); the hook subscribes to it;
- availability: re-read on selection, model change (which covers history), lock, viewport
  and `"availability"` events (a command registered or removed, the clipboard buffer
  filled, the zoom limits moved); the snapshot is kept referentially stable when
  `available` and `reason` are unchanged;
- history: `model.historyState()` re-read on model `change`/`reset`, equality on the four
  fields;
- entity by ID: one shared per-model dispatcher maps ID to a listener set, filled from a
  single `change` subscription that walks the patch operations; only listeners of touched
  IDs are called, and the snapshot is the reader's record, stable while the record is
  unchanged. A `reset` notifies all.
The hook type for the model is `ViewModel`-compatible; history hooks use the `hasHistory`
guard and return an inert state for a model without history (a read-only one).

### D3. Hover is computed from existing picking, once per frame
Pointer moves record the last client position. A callback on the view's frame clock (the
tracker asks the clock for its own frame) runs `pick` (spatial index) only when a position is pending, takes the
topmost candidate, and emits only when the `(kind, id)` pair differs from the last
emitted one. Gestures (any tool not idle, pan, marquee, wheel in progress) suppress
emission and clear nothing until the gesture ends (a gesture is any pointer-captured one:
a node drag, marquee, pan or connection drag; a wheel turn is not one); on end the hover is recomputed from the
last position. Pointer leave emits the leave form. Ports are picked only when the level of detail rule says
ports are pickable at the current zoom. The payload is plain data:
`{ target: null | { kind: "node" | "port" | "connection", ... ids }, rect?: ViewRect }`
where `rect` is a node's on-screen rectangle in client coordinates. The state
`view.hover` returns the current target; `viewState.isHovered` reads it by default, and
a change of the hovered entity always repaints the scene layer, so a painter that reads the
hovered flag needs nothing more. Pointer moves over host content in the overlay layer do
not reach the tracker.

### D4. Overlay placement is a pure function
`OverlayAnchor` node kind gains optional `placement` (`top-left` default, `top`, `top-right`, `left`,
`center`, `right`, `bottom-left`, `bottom`, `bottom-right`, plus an `offset` in CSS pixels
for the edges; edges sit the element outside the body, corners pin the same corner) resolved against the body
bounds in `overlay-host.ts`. `view.nodeRect(id)` returns the node's client rectangle as a
value shaped like a `DOMRect`, with `top`, `left`, `right` and `bottom` (undefined when absent), so floating-UI style libraries can use it as a virtual
reference element. The React `NodeOverlay` creates a host element, calls `overlay.attach`
in an effect, renders children with `createPortal` into that element, and disposes on
unmount. The overlay hides while the node is absent (existing behavior) and focus stability close
semantics are exposed as an `onNodeGone` callback without arguments, called only for a removal from the model being shown (not when the editor unmounts or its model is replaced). Host React context passes through
portals; no extra work except a test.

### D5. Initial fit and zoom limits are mount options
`initialFit?: FitOptions | true` runs fit once, after the first measurable layout (not at
import or before size is known) and only if `initialViewport` is not given. `zoomLimits`
`{ min, max }` is stored per view and consulted by wheel, pinch, `zoomAt`, `set`, and fit
(the fit `maxZoom` is capped by it); `view.setZoomLimits` replaces it at runtime and pulls a
zoom outside the new range back in, so the React prop is live and compared by value.
`initialFit` and `initialViewport` are read once at mount; the React props ignore later
changes, as a `defaultValue` does. Core `clampZoom` keeps its absolute bounds as an outer
guard. Controls (`ViewControls`, a small panel anchored bottom-left by default) are four buttons: zoom in, zoom out, fit and lock. Lock calls the view-level lock (see D6). Fit, zoom in and zoom out run
registry commands: `view.fitAll`, and the new `view.zoomIn` and `view.zoomOut`, which
zoom about the view centre by `{ factor }` (1.25 by default), are unavailable at the matching
zoom limit, and work while the view is locked, so shortcuts and menus can share them. The
buttons render `button` elements with stable class names, inline SVG icons (the lock icon
follows the state; `icons` replaces any of them) and no bundled CSS. A host adds its own
buttons as children, using the exported `ControlsButton`. The availability hook also follows
the `"viewport"` event, since the zoom commands depend on where the zoom is.

## Risks / Trade-offs

- A per-view zoom limit touches `ViewportState`; kept small and covered by existing
  viewport tests.
- Hover recompute after a gesture ends costs one pick; acceptable.
- Remount on non-settable option change loses selection and viewport; documented, and
  the viewport and selection can be passed back by the host.

## Settled Questions

- Wheel over attached content: the wheel over an attached element does not zoom the canvas;
  over the empty part of the overlay layer it still zooms. A browser test (task 4.3)
  confirms it and the overlay layer's wheel handling is adjusted if the first run fails.
- Hover payload: entity kind, stable IDs and, for a node, its screen rectangle. The hit
  member of a composite connection is included only if it costs nothing once the picker
  result is read (task 2.1); no host needs it. Outcome: the picker's connection candidate
  already has an optional `member` (never set today), so the payload passes it through
  when present at no cost. Hover delays stay in the host.
- Hook test environment: browser mode with a real DOM, not a DOM emulation dependency.
  Server rendering tests run in the Node project with `react-dom/server`.

### D6. View lock
A view-local `locked` flag (`view.locked`, `view.setLocked(boolean)`, a change notification and
a mount option `locked`) narrows what the view lets the user do, as the capabilities and read-only mode rule allows: while locked,
the tools that edit (move, resize, connect, reconnect, route edit, delete, paste, rotate) report
unavailable with a "view locked" reason and the matching commands are disabled; pan, zoom, fit,
selection, inspection and hover keep working. Lock never relaxes adapter permissions and is
never serialized or put in history. React exposes it as `useViewLocked()`.

Where the lock is enforced, each place for a reason: the command registry (any command not
registered with `allowWhenLocked` is refused), the tool context's `can` and `plan` (so no
tool starts or finishes an edit), the route-editor lookup (no segment cursor or drag while
locked) and the clipboard service (its direct paste and cut methods). Locking also ends the
gesture in progress and cancels a pending connection choice, so nothing planned earlier can
arrive late. A separate gate on the final commit was removed as redundant.
