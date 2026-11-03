# Design

## Context

`ViewHandle` already exposes `viewport.get`, `selection.on`, `commands.availability`,
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
`setTheme`, `input.toolOptions` via `setToolOptions`) are applied in effects without
remount. Options without setters (`model`, `geometry`, `routes`, `painters`, `input`
tool list, `initialViewport`, `initialFit`, `zoomLimits`) are compared by identity and a
change remounts the view; the docs say to memoize them. Alternative considered: keeping
the view alive and diffing every option; rejected, it would need setters the view
deliberately lacks.

### D2. Hooks are `useSyncExternalStore` over narrow subscribe functions
Each hook has a `subscribe` and a cached `getSnapshot` that returns the same object while
the underlying value is equal:
- selection: `selection.on`, snapshot `{ keys, primary }` taken from the event (already
  immutable arrays);
- viewport: `ViewportState` has no event today, so the view gains a coalesced
  `viewport` change notification (at most once per animation frame, never per pointer
  sample); the hook subscribes to it (REA-04);
- availability: re-evaluated on selection, model change and history change, snapshot kept
  referentially stable when `available` and `reason` are unchanged;
- history: `model.historyState()` re-read on model `change`/`reset`, equality on the four
  fields;
- entity by ID: one shared per-model dispatcher maps ID to a listener set, filled from a
  single `change` subscription that walks the patch operations; only listeners of touched
  IDs are called, and the snapshot is the reader's record, stable while the record is
  unchanged. A `reset` notifies all.
The hook type for the model is `ViewModel`-compatible; history hooks need `EditableModel`
and return an inert state for a read-only model.

### D3. Hover is computed from existing picking, once per frame
Pointer moves record the last client position. A frame callback (the existing scheduler)
runs `pick` (spatial index, GEO-04, GEO-04a) only when a position is pending, takes the
topmost candidate, and emits only when the `(kind, id)` pair differs from the last
emitted one. Gestures (any tool not idle, pan, marquee, wheel in progress) suppress
emission and clear nothing until the gesture ends; on end the hover is recomputed from the
last position. Pointer leave emits the leave form. Ports are picked only when LAY-04 says
ports are pickable at the current zoom. The payload is plain data:
`{ target: null | { kind: "node" | "port" | "connection", ... ids }, rect?: ViewRect }`
where `rect` is a node's on-screen rectangle in client coordinates. The state
`view.hover` returns the current target; `viewState.isHovered` reads it by default, and
a change repaints the scene layer only when painters use hover (a flag already tracked by
selection repaints is reused).

### D4. Overlay placement is a pure function
`OverlayAnchor` node kind gains optional `placement` (`top-left` default, `top`, `bottom`,
`left`, `right`, `center`, plus an `offset` in CSS pixels) resolved against the body
bounds in `overlay-host.ts`. `view.nodeRect(id)` returns the node's client rectangle as a
value (undefined when absent), so floating-UI style libraries can use it as a virtual
reference element. The React `NodeOverlay` creates a host element, calls `overlay.attach`
in an effect, renders children with `createPortal` into that element, and disposes on
unmount. The overlay hides while the node is absent (existing behavior) and REA-07 close
semantics are exposed as an `onNodeGone` callback. Host React context passes through
portals; no extra work except a test.

### D5. Initial fit and zoom limits are mount options
`initialFit?: FitOptions | true` runs fit once, after the first measurable layout (not at
import or before size is known) and only if `initialViewport` is not given. `zoomLimits`
`{ min, max }` is stored per view and consulted by wheel, pinch, `zoomAt`, `set`, and fit
(the fit `maxZoom` is capped by it). Core `clampZoom` keeps its absolute bounds as an outer
guard. Controls (`ViewControls`, a small panel anchored bottom-left by default) are four buttons: zoom in, zoom out, fit and lock. Lock calls the view-level lock (VIS-06, see D6). Fit: fit runs the existing `view.fitAll`
command through the registry (INT-07); zoom in and out call `viewport.zoomAt` at the view
centre with a configurable factor, because no zoom command exists (adding one is left
out of scope). They render `button` elements with stable class
names and no bundled CSS.

## Risks / Trade-offs

- A per-view zoom limit touches `ViewportState`; kept small and covered by existing
  viewport tests.
- Hover recompute after a gesture ends costs one pick; acceptable.
- Remount on non-settable option change loses selection and viewport; documented, and
  the viewport and selection can be passed back by the host.

## Open Questions

- Does the wheel over a popover element zoom the canvas, and does it still zoom over empty
  overlay area? Verified by a browser test in task 5.3; the intended behavior is stated in
  OVL-03.
- Hover payload for connections: the hit member (for composite connections) is included
  or not (task 2.1 decides after reading GEO-04a).
- Unit-test environment for hooks: browser mode (real DOM) is preferred over adding a DOM
  emulation dependency; SSR tests run in the Node project with `react-dom/server`.

### D6. View lock (VIS-06)
A view-local `locked` flag (`view.locked`, `view.setLocked(boolean)`, a change notification and
a mount option `locked`) narrows what the view lets the user do, as MOD-11 allows: while locked,
the tools that edit (move, resize, connect, reconnect, route edit, delete, paste, rotate) report
unavailable with a "view locked" reason and the matching commands are disabled; pan, zoom, fit,
selection, inspection and hover keep working. Lock never relaxes adapter permissions and is
never serialized or put in history. React exposes it as `useViewLocked()`.
