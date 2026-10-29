# Tasks

## 1. Browser test setup

- [x] 1.1 Add dev dependencies for Vitest's Playwright browser provider and Playwright, configured to drive the installed Google Chrome (`channel: "chrome"`) with no bundled browser download; verify `package.json` lists them only under devDependencies and no `npx playwright install` step is needed
- [x] 1.2 Split `vitest.config.ts` into `node` (all `*.test.ts`) and `browser` (`src/view/**/*.browser.test.ts`, installed Chrome, headless) projects, and add `npm run test:browser`; verify a trivial `src/view/smoke.browser.test.ts` passes in Chrome and `npm test` still runs the Node tests
- [x] 1.3 Verify `src/view/import-ssr.test.ts` ("view import without browser globals") imports `nodeeditor-js/view` in the Node project without touching `window` or `document`
- [x] 1.4 Add `examples/plain-js/` (an `index.html` plus a module script) and `npm run demo`, which serves it with a Vite dev server (dev dependency only) that resolves `nodeeditor-js` imports to `src/` and reloads on save; verify the page loads with no console errors. The demo starts as an empty mounted view and grows as later tasks land (background, nodes, wires, assets, overlays), so each step can be seen in the browser
- [x] 1.5 Add the `nodeeditor-js/view/advanced` entry next to `nodeeditor-js/view` (package `exports` and a tsup entry), with neither re-exporting core; verify `src/view/entry-points.test.ts` ("one import path per public name") finds no name exported by two entry points and `import-ssr.test.ts` imports both in Node

## 2. Mount, layers, metrics, and scheduling

- [x] 2.1 Implement `platform/dom/layer-stack.ts` and `mount-view.ts` (root, three canvases, overlay div; idempotent dispose); verify `mount-view.browser.test.ts` ("dispose twice", "no listeners after dispose") shows that DOM nodes, observers, and rAF requests are released
- [x] 2.2 Implement `platform/frame-scheduler.ts`; verify `frame-scheduler.test.ts` (Node, fake rAF) ("many changes in one frame", "idle editor") asserts one repaint per dirty layer per frame and zero requests when idle
- [x] 2.3 Implement `platform/dom/container-metrics.ts` and `platform/viewport-state.ts` (ResizeObserver, DPR media-query watch, client rect at call time, zero-size wait); verify `viewport-state.browser.test.ts` ("scrolled page with nested offsets", "pixel ratio change", "zero-size container") passes

## 3. Registries, theme, and scene painting

- [x] 3.1 Implement `render/registries/painters.ts` (independent node, port glyph, and connection registries with fallbacks); verify `painters.test.ts` ("new port glyph only", "reuse painter with new geometry", "…") passes
- [x] 3.2 Implement `render/theme/tokens.ts` and `render/theme/resolve-style.ts`; verify `resolve-style.test.ts` ("per-type and per-entity overrides") passes, and `two-views.browser.test.ts` ("two themes on one model") shows each view painting with its own tokens
- [x] 3.3 Implement `render/paint/scene-layer.ts` (culling query, z-order, composed transforms, painter dispatch) and `render/primitives/grid.ts`; verify `scene-layer.browser.test.ts` ("large graph navigation", "override z-order", "pan repaints background and scene") uses spy painters on a seeded 10k-node fixture to show only visible entities are painted
- [x] 3.4 Implement `render/paint/level-of-detail.ts`; verify `level-of-detail.test.ts` ("zoomed far out") shows labels hidden while selection and error badges are still requested
- [x] 3.5 Implement `render/paint/interaction-layer.ts` with ordered painters and explicit invalidation; verify `interaction-layer.browser.test.ts` ("drag preview repaints only interaction layer") passes

## 4. Asset service

- [x] 4.1 Implement `render/assets/svg-safety.ts`; verify `svg-safety.browser.test.ts` ("active SVG content", "…") rejects scripts, event attributes, foreignObject, external href, and `url()` styles while accepting a plain symbol
- [x] 4.2 Implement `render/assets/zoom-bucket.ts` and `render/assets/bitmap-cache.ts` (LRU, byte budget, close on evict); verify `bitmap-cache.test.ts` ("cache limit reached") passes in Node with fake bitmaps
- [x] 4.3 Implement `render/assets/asset-service.ts` (resolver, lifecycle, nearest-bucket fallback, bounded failures, no fetch without a resolver); verify `asset-service.browser.test.ts` ("no resolver configured", "repeated frames reuse bitmaps", "zoom crosses a bucket", "asset load fails") passes and counts rasterizations

## 5. Presets and placeholders

- [x] 5.1 Implement `render/presets/image-symbol-painter.ts`, `render/presets/port-glyph-painter.ts`, and `render/presets/connection-painter.ts`; verify `image-symbol.browser.test.ts` ("rotated symbol with ports") probes pixels at DPR 1 and 2 to show the picture, glyphs, and connection endpoints coincide with core anchors in all 8 rotation/mirror states
- [x] 5.2 Implement `render/presets/card-painter.ts` with cached text measurement; verify `card.browser.test.ts` ("card with labeled ports") shows the title and port labels painted and the ports pickable through `view.pick`
- [x] 5.3 Implement `render/primitives/placeholder.ts`; verify `placeholder.browser.test.ts` ("unknown type placeholder", "missing asset placeholder") paints a visible placeholder while the model payload stays unchanged

## 6. Model binding, overlays, presence, and the tool-facing API

- [x] 6.1 Implement `platform/model-binding.ts` (committed changes → geometry scene → dirty kinds); verify `model-binding.test.ts` ("theme change", "status decoration update", "edit visible in both views") asserts no geometry recompute on theme/status changes and that both views repaint after one edit
- [x] 6.2 Verify `snapshot-after-paint.browser.test.ts` ("snapshot after painting") shows a snapshot taken after painting with assets is JSON-compatible and holds asset references only
- [x] 6.3 Implement `interact/overlay/overlay-host.ts`; verify `overlay.browser.test.ts` ("inline editor on a node", "overlay follows pan and zoom", "hidden overlay does not block input") passes
- [x] 6.4 Implement `interact/overlay/presence.ts` and `setPresence`; verify `presence.browser.test.ts` ("remote cursor") shows the cursor drawn at its world position after pan and zoom, with no model change events emitted
- [x] 6.5 Expose `clientToWorld`, `pick`, `viewport.set/zoomAt/panBy`, `interaction.add/invalidate`, and `element` on the view handle; verify `view-handle.browser.test.ts` ("pick through view", "tolerance in CSS pixels at DPR 2") passes

- [x] 6.6 Implement `renderStats()` on the view handle (per-layer last paint duration, painted and culled node and path counts, `framesPainted`, `lastPaintedInputSeq`); verify `render-stats.browser.test.ts` ("render stats") shows counts match a culled seeded fixture, `framesPainted` rises by one per painted frame and stays unchanged while idle

## 7. Integration checks

- [x] 7.1 Complete `examples/plain-js/` so it mounts a view over a headless model with image-symbol and card nodes from static files; verify it renders under `npm run demo` and as a production build served by any static server, with no network requests beyond its own files
- [x] 7.2 Run `npm run lint`, `npm run typecheck`, `npm test`, and `npm run test:browser`; verify all pass and every new file under `src/view/` stays within 300 lines
