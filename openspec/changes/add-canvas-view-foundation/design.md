# Design: add-canvas-view-foundation

## Context

See proposal.md for motivation. The headless `GeometryScene` from
`add-geometry-and-spatial-index` owns transforms, bounds, anchors, paths, culling, and
picking. The view only paints and converts browser coordinates; it holds no second graph
(MOD-02). View modules must import cleanly during server rendering, so every browser access
happens inside `mountView` or later (REA-06, PKG-05).

## Goals / Non-Goals

**Goals:**
- Correct pixels at any zoom and pixel ratio, with one transform path shared with picking.
- Zero idle work: no frame is requested while nothing is dirty.
- Painters, geometry, themes, and assets can be swapped independently.

**Non-Goals:**
- Gesture handling and tools (`add-basic-tools`).
- Partial-region (dirty-rectangle) repaints. Each layer repaints fully over its culled set;
  revisit after `add-perf-baseline` measures it.
- OffscreenCanvas/worker rendering.

## Decisions

### D1. Module layout (each file 100–300 lines)

```
src/view/
  platform/
    dom/layer-stack.ts         creates background/scene/interaction canvases + overlay div
    dom/container-metrics.ts   ResizeObserver, DPR media-query watch, client rect at event time
    frame-scheduler.ts         per-layer dirty flags, single rAF request, no loop
    viewport-state.ts          zoom/pan state over core viewport transform; clientToWorld
    model-binding.ts           subscribes to committed changes -> GeometryScene -> dirty kinds
  render/
    primitives/frame.ts        paint frame (context, DPR, viewport) and setMatrix
    primitives/grid.ts         grid painter
    primitives/placeholder.ts  unknown type / missing asset (NOD-07, AST-04)
    theme/tokens.ts            ThemeTokens type + defaults
    theme/resolve-style.ts     type and entity overrides -> resolved style per paint call
    assets/asset-service.ts    resolver contract, request lifecycle, diagnostics
    assets/svg-safety.ts       reject scripts, event attributes, foreignObject, external refs
    assets/zoom-bucket.ts      bucket selection from zoom * dpr
    assets/bitmap-cache.ts     LRU keyed by asset+bucket, byte budget, bitmap.close() on evict
    registries/painters.ts     NodePainter / PortGlyphPainter / ConnectionPainter registries
    presets/image-symbol-painter.ts
    presets/card-painter.ts
    presets/port-glyph-painter.ts
    presets/connection-painter.ts  straight/Bezier strokes from PathGeometry
    paint/scene-layer.ts       culling query, z-order, per-entity transform + painter dispatch
    paint/interaction-layer.ts ordered interaction painters (tools, presence)
    paint/level-of-detail.ts   zoom thresholds -> "full" | "reduced" | "minimal"
  interact/
    overlay/overlay-host.ts    DOM overlay slot aligned to viewport (OVL-01, REN-03)
    overlay/presence.ts        presence data -> interaction-layer painter (OVL-02)
  mount-view.ts                mountView(container, options) -> ViewHandle; wiring + dispose
  index.ts                     host API (`nodeeditor-js/view`)
  advanced.ts                  building blocks (`nodeeditor-js/view/advanced`)
```

The folders are layers, lowest first: `platform/` ← `render/` ← `interact/` ← the mount
files. A module imports from its own layer or a lower one, never from above, and reaches
core only through `src/core/index.ts`; `src/architecture.test.ts` checks both. Inside
`render/`, `primitives/` holds the drawing helpers that registries, presets and paint
layers share, so those do not import each other.

`nodeeditor-js/view` exports what a host needs to mount, customize and theme an editor.
The building blocks (frame scheduler, layer painters, fallback painters, style helpers)
are exported from `nodeeditor-js/view/advanced` instead, and neither entry re-exports
core, so each public name has exactly one import path (PKG-01).

### D2. Public surface

```ts
interface ViewOptions {
  model: ModelReader & ChangeSource;        // from add-graph-model-core / add-patches-and-history
  geometry?: GeometryRegistry;              // defaults include presets
  painters?: PainterRegistrations;          // node / port glyph / connection, independent
  theme?: Partial<ThemeTokens>;
  assets?: { resolve(ref: string): Promise<AssetSource>; budgetBytes?: number };
  zoomRange?: { min: number; max: number }; // within core limits
  zOrder?: LayerOrder;                      // default: connections < nodes < ports < labels
}
interface ViewHandle {
  readonly viewport: { get(): Viewport; set(v: Viewport): void; zoomAt(p: Point<"viewport">, factor: number): void; panBy(dx: number, dy: number): void };
  clientToWorld(clientX: number, clientY: number): Point<"world">;
  pick(clientX: number, clientY: number, opts?: PickOptions): readonly HitCandidate[];
  interaction: { add(p: InteractionPainter): () => void; invalidate(): void };
  overlay: { attach(el: HTMLElement, anchor: OverlayAnchor): OverlayHandle };
  setPresence(entries: readonly PresenceEntry[]): void;
  setTheme(t: Partial<ThemeTokens>): void;
  renderStats(): RenderStats;               // debug/benchmark surface, cheap, no allocation of scene data
  readonly element: HTMLElement;            // root for tools to attach listeners
  dispose(): void;                          // idempotent
}
```

`RenderStats = { layers: Record<"background" | "scene" | "interaction", { lastPaintMs: number }>;
nodes: { painted: number; culled: number }; paths: { painted: number; culled: number };
framesPainted: number; lastPaintedInputSeq: number }`. It is read-only and counts only; the
benchmark harness (`add-perf-baseline`) reads it and it carries no scene data.

`AssetSource = { kind: "svg"; text: string } | { kind: "blob"; blob: Blob }`. URLs are
deliberately excluded, so the library never fetches; the host's resolver does (AST-01, PKG-02).

### D3. Layers and scheduling

There are three absolutely positioned `<canvas>` elements plus an overlay `<div>` in one
`position: relative` root. Each canvas's backing size is `cssSize × dpr`.

The scheduler keeps a dirty set of `background | scene | interaction`. `markDirty` requests
one `requestAnimationFrame` if none is pending; the frame repaints only the dirty layers,
then clears them. Nothing re-arms unless something becomes dirty again (LAY-02). An
animation can keep the interaction layer dirty only while it runs.

What repaints what:
- Pan and zoom dirty background + scene.
- Tool previews dirty only the interaction layer (LAY-01).

Alternatives considered:
- **Single canvas with dirty rectangles:** fewer elements, but complex clipping and
  invalidation.
- **Full single-canvas redraw:** simpler, but every preview frame would repaint the scene.

### D4. Coordinate conversion (GEO-03)

`clientToWorld` reads `getBoundingClientRect()` of the root at call time. This is cheap, and
it is correct under page scroll and nested offsets without caching scroll state. The result
goes through the core viewport inverse.

DPR comes from `devicePixelRatio` and is watched with a `matchMedia("(resolution: Xdppx)")`
listener that re-registers on each change. The resulting resize resets backing stores and
dirties all layers. `ResizeObserver` (content box) drives size changes. A zero size defers
painting and conversions return a documented "not measurable" Result. Nothing produces NaN
(GEO-06).

### D5. Scene painting

For each frame:

1. Compute the visible world rect from the viewport.
2. Query `GeometryScene.queryRect(rect, "painted")`, which returns results in paint order.
3. Paint by z-layer (default connections, then node bodies, then port glyphs, then labels;
   overridable per VIS-02, with picking given the same order through `PickOptions`).
4. For each node, call `ctx.setTransform(device · viewport · nodeTransform)` once, then the
   painter, then port glyphs at local anchors.

Connections paint in world space with the viewport matrix. Line widths divide by zoom where
the theme declares screen-space widths.

```ts
interface NodePainter { paint(ctx: CanvasRenderingContext2D, input: NodePaintInput): void }
interface NodePaintInput {
  node: NodeView;
  bounds: Rect<"local">;
  style: ResolvedStyle;
  lod: DetailLevel;
  state: { selected: boolean; hovered: boolean; diagnostics: readonly DiagnosticBadge[] };
  assets: AssetDrawer;  // drawAsset(id, rect) -> "drawn" | "pending" | "failed"
}
```

Painters are pure functions of their input: no model writes and no stored state (REN-01,
§3 invariant). Selection and hover state comes from view-local state that `add-basic-tools`
will set; this change provides the empty sets.

### D6. Level of detail (LAY-04)

| Zoom | Level | What is drawn |
| --- | --- | --- |
| ≥ 0.6 | `full` | everything |
| 0.25–0.6 | `reduced` | port labels and secondary labels hidden |
| < 0.25 | `minimal` | titles hidden; bodies drawn as flat fills or cached bitmaps |

Selection outlines, error badges, and connection endpoints are always drawn. The thresholds
are theme tokens.

### D7. Asset service (AST-01..04)

Request lifecycle: `unrequested → resolving → decoding → ready | failed`.

- **SVG:** text passes `svg-safety.ts` first. It is parsed with `DOMParser` and rejected if
  it contains `script`, `foreignObject`, `on*` attributes, or `href`/`xlink:href` not
  starting with `#` or `data:image/`. Accepted text becomes a Blob URL, is decoded via
  `Image.decode()`, then rasterized with `createImageBitmap(img, { resizeWidth,
  resizeHeight })` at the bucket size.
- **Raster:** decoded once with `createImageBitmap(blob)`, then down-scaled per bucket.
- **Buckets:** `bucket = 2^ceil(log2(zoom · dpr · intrinsicScale))`, clamped to [1/8, 16].
  While the target bucket is decoding, the nearest ready bucket is drawn scaled.
  Completion marks the scene dirty with kind `asset`.
- **Memory:** LRU over `(assetId, bucket)` with a default budget of 64 MiB (w·h·4 bytes);
  evicted bitmaps are `close()`d.
- **Failure:** a resolver rejection or safety failure marks the asset failed with a
  diagnostic and draws a placeholder. There is no automatic retry until
  `assets.retry(id)` is called or the resolver option is replaced, which bounds retries
  (SAFE-03).

Alternative considered: SVG to `Path2D` vector conversion. It is deferred as a later
option, per the interview decision.

### D8. Invalidation from model changes (REN-04)

`model-binding.ts` listens to committed-change events. It forwards each patch to
`GeometryScene.apply` and then classifies the patch:

| Kind | Changes | Dirty layers |
| --- | --- | --- |
| geometry | add, remove, move, transform, ports | scene |
| style/content | labels, status | scene, with no geometry recompute |
| asset | an asset finished or failed | scene |

Theme changes dirty background + scene only and never call into the geometry scene.
Viewport changes never touch the model.

### D9. Overlay and presence

The overlay `div` has `pointer-events: none`. Attached elements set `pointer-events: auto`,
and the host removes them by disposing the handle (REN-03 hidden-overlay case). On viewport
change, each anchored element gets `transform: translate(x, y)` from its anchor's world →
viewport position. One pass per frame runs only when overlays exist.

Presence entries `{ id, kind: "cursor" | "selection", world: Point | nodeIds, color, label }`
are drawn by a built-in interaction painter. Setting presence dirties only the interaction
layer and never touches the model (OVL-02).

### D10. Browser test setup

Vitest gets two projects:
- `node` keeps `environment: "node"` for all `*.test.ts`.
- `browser` runs `src/view/**/*.browser.test.ts` in the installed Google Chrome via the
  Playwright provider (`channel: "chrome"`, headless), so no browser download is needed.
  Firefox and WebKit can be enabled by a `BROWSERS` env variable for later CI; system Safari
  can be driven later through `safaridriver` (WebdriverIO provider) as an opt-in run.

The demo in `examples/plain-js/` runs under a Vite dev server (`npm run demo`, dev dependency
only), aliasing `nodeeditor-js` imports to `src/` so edits reload in the browser at once.

Tests assert painter call logs (spy painters) and probe a few pixels with `getImageData` at
DPR 1 and 2 (emulated by Playwright `deviceScaleFactor`). Pixel snapshots are not used as
correctness proof (§17).

## Risks / Trade-offs

- [`createImageBitmap` resize options or SVG decoding differ across browsers] → Feature-detect
  the resize support and fall back to drawing the decoded image into an `OffscreenCanvas`
  (or a canvas element) at bucket size. Cover Chromium now; Firefox/WebKit in the browser
  matrix later.
- [The DOMParser-based SVG screen may miss exotic vectors (CSS `url()`, `<use>` to
  external)] → Also reject `style` content containing `url(` with a non-`#` target and
  `<use>` with an external href. Hosts can supply their own sanitizer through the resolver.
- [Full-layer repaint per frame could exceed budgets at F-LARGE] → Culling bounds the work;
  `add-perf-baseline` measures it before dirty-rectangles or bitmap caching of nodes is
  considered.
- [Text rendering without measurement in core] → The card painter measures with
  `ctx.measureText` in the view and caches widths per font+string; overflow beyond declared
  painted margins is clipped rather than culled incorrectly.
- [DPR listener edge cases when moving between displays] → Re-register the media query on
  every change, and cover DPR switching with a browser test that changes `deviceScaleFactor`.
