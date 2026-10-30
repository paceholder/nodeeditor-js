# Proposal: add-canvas-view-foundation

## Why

Slice A needs a minimal plain-JS view: mount the editor on a page and see a graph drawn
quickly and correctly at any zoom and pixel ratio. The headless geometry scene already
knows where everything is; this change turns it into pixels with Canvas2D. Repaints stay
cheap and stop entirely when idle, which sets the rendering foundation that the
performance budgets depend on.

## What Changes

- Add `mountView(container, options)`, which creates all DOM on mount (nothing at import
  time), returns a view handle, and provides an idempotent `dispose()` that releases every
  listener, observer, frame request, subscription, bitmap, and DOM node.
- Add stacked canvases: background (grid), scene (connections, nodes, ports), and
  interaction (previews and tool drawing), plus a DOM overlay layer. Each layer repaints
  independently.
- Add a dirty-driven frame scheduler: at most one repaint per layer per animation frame,
  and no frame requests when nothing is dirty.
- Add viewport state (zoom, pan) on the core viewport transform, with client-to-world
  conversion that stays correct under page scroll, nested offsets, resize, fractional zoom,
  and device-pixel-ratio changes. Zero-size containers wait for measurable bounds.
- Add independent painter registries: node body painters by type, port glyph painters,
  connection painters, a background painter, and interaction painters. Each is separate
  from geometry.
- Add theme tokens with per-type and per-entity overrides, a default z-order with
  overrides, and zoom-based level of detail.
- Add culled painting using the geometry scene's painted-bounds query.
- Add painters for the image-symbol and card presets, a default port glyph, default
  straight/Bezier connection painting, and an unknown-type/missing-asset placeholder.
- Add an asset service: a host resolver, SVG safety screening, and zoom-bucketed
  `ImageBitmap` rasterization with nearest-bucket fallback and LRU eviction under a byte
  budget. Raster formats are supported, failures produce bounded placeholders, and nothing
  is fetched without a resolver.
- Add a DOM overlay slot aligned to the viewport transform, and a presence hook for
  host-supplied remote cursors and selections in world coordinates.
- Add a model subscription: committed changes update the geometry scene and invalidate only
  the affected layers. Theme changes repaint without touching geometry.
- Expose what tools need: `clientToWorld`, `pick`, programmatic viewport setters, and
  interaction-layer painters with explicit invalidation.
- Set up Vitest browser mode (Playwright provider) for real-browser view tests; headless
  tests keep running in Node.

Requirements implemented: LAY-01, LAY-02, LAY-03, LAY-04, REN-01, REN-02, REN-03, REN-04,
VIS-01, VIS-02, VIS-03 (painting side), AST-01, AST-02, AST-03, AST-04, PRE-01, PRE-02, OVL-01,
OVL-02, GEO-03, GEO-06 (zero-size container); partially NOD-02, NOD-05 (title/label
painting), NOD-07 (placeholder painting), NOD-08, LIFE-01 (view disposal), SAFE-01 (built-in
SVG screening), PRT-06 (glyph states as painter input).

Out of scope:
- Interaction tools: selection, marquee, move, drag-to-connect, and pan/zoom gestures,
  including wheel and pointer handling (`add-basic-tools`).
- Fit-all/fit-selection commands (INT-01), keyboard shortcuts.
- React mounting and React node bodies (NOD-06, REN-06 React-content profile), image export
  (REN-05), the LIFE-02 hidden/detached suspension beyond the zero-size wait, renderer
  context-loss recovery (LIFE-03), orthogonal routes and decorations (ROU-09).
- Benchmarks and bundle measurement (`add-perf-baseline`).

## Capabilities

### New Capabilities
- None. The baseline spec `canvas-view` (and the `geometry`, `node-types`, and
  `safety-lifecycle` specs) already state these requirements; this change implements them.

### Modified Capabilities
- None. `skip_specs: true` is set because no requirement text changes.

## Impact

- New modules under `src/view/` in three layer folders, `platform/`, `render/` and
  `interact/` (browser APIs touched only inside `mountView`). What a host uses is exported
  from `nodeeditor-js/view`; the building blocks from `nodeeditor-js/view/advanced`.
- Depends on `add-geometry-and-spatial-index` (geometry scene, transforms, picking),
  `add-graph-model-core` (read snapshots), and `add-patches-and-history` (committed-change
  events). `add-commands-and-policy` is not required for rendering.
- New dev dependencies: Vitest's Playwright browser provider and Playwright (driving the
  installed Google Chrome; no browser download), and Vite for the demo dev server. There
  are no new runtime dependencies.
- Vitest config gains two projects: `node` (all `*.test.ts`) and `browser`
  (`src/view/**/*.browser.test.ts`).
