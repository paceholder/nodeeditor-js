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

Requirements implemented: the Canvas2D stacked layers rule, the dirty-driven frame scheduling rule, the culled painting rule, the level of detail rule, the independent extension contracts rule, the rule that renderer objects stay behind the boundary, the shared viewport and input ownership rule and the targeted invalidation rule,
the theme tokens and overrides rule, the z-order and interactive order rule and the body, painted and hit bounds rule (painting side), the asset service with host resolver rule, the zoom-bucketed bitmap cache rule, the bounded asset memory rule, the asset failure states rule, the image-symbol node preset rule, the card node preset rule and the DOM overlay slot rule,
the presence overlay hook rule, the rule that geometry stays correct under layout and display changes and the finite ranges and degenerate inputs rule (zero-size container); partially the custom shapes and portless nodes rule and the independent labels and decorations rule (title/label
painting), the unknown types and missing assets rule (placeholder painting), the independent extension registrations rule and the per-instance disposal rule (view disposal), the untrusted imported content rule (built-in
SVG screening), the distinct target states rule (glyph states as painter input).

Out of scope:
- Interaction tools: selection, marquee, move, drag-to-connect, and pan/zoom gestures,
  including wheel and pointer handling (`add-basic-tools`).
- Fit-all/fit-selection commands, keyboard shortcuts.
- React mounting and React node bodies (the rendering profiles rule React-content profile), image export
  (image export), the hidden/detached suspension beyond the zero-size wait, renderer
  context-loss recovery, orthogonal routes and decorations.
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
