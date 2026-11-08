# Proposal

## Why

The `react` entry point only re-exports `view`. A React host must hand-write mounting,
cleanup and every subscription, even though the React requirements already describe a provider,
a mount component and hooks. Three further gaps block a React shell that sits around the
editor (inspector, toolbar, palette, popovers):

- the view cannot say which node, port or connection the pointer is over, so a host cannot
  build delayed tooltips, popovers, cross-panel highlights or cursor changes (hover);
- the overlay primitive `view.overlay.attach` anchors only to a node's top-left corner and
  has no React wrapper, so a single popover or inline editor next to a node needs
  hand-written DOM plumbing;
- there is no way to fit the view on first load, to set zoom limits per view, or to
  put zoom and fit buttons in a toolbar.

Nodes stay canvas-painted. This change is about the shell around the canvas, not React
content inside nodes, which remains scheduled later.

## What Changes

- **React mount, provider and hooks.** A mount component
  owning one `ViewHandle` (created on mount, disposed on unmount, Strict Mode safe), a
  provider and an instance hook, and `useSyncExternalStore` hooks with stable snapshots
  for selection, viewport (frame-coalesced), command availability, history state, and
  entity subscription by node or connection ID. Subscription granularity is documented.
- **Hover events (new the hover event rule).** `view.on("hover", ...)` and a `view.hover` state:
  entity kind, ID, for a node its screen rectangle, and a leave form (a connection's hit member only if free); frame-coalesced, silent
  during gestures, level-of-detail aware, fed by the existing hit-testing. `view.hover`
  also feeds `ViewState.isHovered` by default. A React hook exposes it.
- **Anchored overlay (new the overlay placement rule).** Overlay placement relative to a node's body
  bounds (corners, above, below, centred) and the node's on-screen rectangle as a value; a
  React component/hook that portals children into one overlay slot for one node, with
  input isolation and host React context preserved. Documented as meant for a handful of
  nodes, not per-node mounting for the whole graph.
- **Initial fit, zoom limits, controls (new the initial fit and zoom limits rule).** `initialFit` and
  `zoomLimits` mount options (with `FitOptions` padding), and an optional unstyled React
  control set (zoom in, zoom out, fit) built on the command registry.
- Extends the React example under `examples/` next to `plain-js`; updates
  `docs/architecture.md` and adds `docs/guide-react.md`.

### Requirement IDs

- Implements: the provider, mount component, and hooks rule, the subscription granularity rule, the Strict Mode and remount safety rule and the server rendering safety rule (already specified); the rule that React is a peer dependency and the DOM overlay slot rule,
  the input scoping rule, the two-phase hit-testing rule, the hit result identity and order rule, the level of detail rule and the gesture lifecycle and cancellation rule are relied on and re-verified.
- Modifies: the provider, mount component, and hooks rule (adds history and hover hooks to the list).
- Adds: the hover event rule and the hover state rule (interaction), the overlay placement rule (canvas-view), the initial fit and zoom limits rule (canvas-view),
  the anchored node overlay rule and the view controls rule (react-integration).

### Out of scope

- React content inside nodes, measurement loops, per-node React roots (the React content inside nodes rule and the interactive React node content rule,
  the focus stability rule for node bodies). focus stability is covered only for the single anchored
  overlay slot.
- Docking, reconnect-by-dragging, asynchronous connection policy, external adapters and
  snapshot synchronisation, intent decoding of submissions (separate changes).
- Per-connection or per-node host styling, port hit-target sizing, packaging and
  publication, palette drop recipes.
- Any popover, tooltip or toast UI: the library supplies anchors and events; hover delays
  and content stay in the host.
- Ready-made styling of the zoom controls beyond class names and CSS variables.
