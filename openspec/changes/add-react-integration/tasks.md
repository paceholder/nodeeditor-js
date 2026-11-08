# Tasks

## 1. View-side hooks the React layer needs (view)

- [x] 1.1 Add a frame-coalesced viewport change notification to the view handle; verify `src/view/viewport-notify.browser.test.ts` named for the subscription granularity rule: 100 pointer-sample pans in one frame yield one notification, and no notification without a change
- [x] 1.2 Add `zoomLimits` mount option and enforce it in wheel/pinch, `zoomAt`, `set` and fit; verify `src/view/platform/viewport-state.test.ts` and a browser test named for the initial fit and zoom limits rule "Zoom limits" (0.1 to 2, fit capped)
- [x] 1.3 Add `initialFit` mount option running once after the first measurable layout and not when `initialViewport` is given; verify `src/view/initial-fit.browser.test.ts` named for the initial fit and zoom limits rule "Fit on first load" (once, padding honoured, skipped with an initial viewport)
- [x] 1.4 Add `view.nodeRect(id)` and the node `placement`/`offset` anchor options with a pure placement function; verify `src/view/interact/overlay/placement.test.ts` named for the overlay placement rule for each placement and zoom, plus a browser test "Node rectangle as a value" (absent node returns undefined)

## 2. Hover (view/interact)

- [x] 2.1 Implement the hover tracker (state, frame-coalesced pick, change detection, gesture suppression, leave and removed-entity handling, the level-of-detail ports rule) as a headless module with `hover-types.ts`; include the node's screen rectangle in the node payload and add a connection member only if the picker already returns it for free (record the outcome in the design); verify `hover-tracker.test.ts` named for hover event, hover state, hit result order and level of detail for enter, within, leave, burst, gesture, ports-hidden, removed entity
- [ ] 2.2 Wire pointer move/leave in DOM input, add `"hover"` to `ViewEventMap`, expose `view.hover`, and feed `ViewState.isHovered` by default; verify `src/view/hover.browser.test.ts` in Chrome named for the hover event rule, the hover state rule and the gesture lifecycle and cancellation rule: one event on enter carrying the node's screen rectangle, none within, one on leave, none during a node drag, hovered flag seen by a test painter

## 3. React bindings (react)

- [ ] 3.1 Implement the provider, instance hook and `NodeEditor` mount component with option classification (settable vs remount); verify `src/react/mount.browser.test.ts` named for the provider, mount component, and hooks rule and the Strict Mode and remount safety rule: mount/unmount disposes once, Strict Mode leaves exactly one listener set (count `pointerdown` registrations), theme update keeps the instance, geometry change remounts without leaking
- [ ] 3.2 Implement selection, viewport, availability and history hooks over `useSyncExternalStore` with stable snapshots; verify `src/react/hooks.browser.test.ts` named for the provider, mount component, and hooks rule and the subscription granularity rule for the "Inspector follows selection", "Command availability hook" and "History hook" scenarios and a render-count test that a pan renders the viewport hook at most once per frame
- [ ] 3.3 Implement the entity-by-ID hook with a per-model dispatcher; verify `src/react/entity-hook.browser.test.ts` named for the subscription granularity rule for "Drag does not re-render inspector" and "Entity-level subscription" with a 1k-node graph and render counts, including `reset` notifying all
- [ ] 3.4 Implement the hover hook; verify, in browser mode with a real DOM, `src/react/hover-hook.browser.test.ts` named for the provider, mount component, and hooks rule and the hover event rule that a component re-renders only when the hovered entity changes
- [ ] 3.5 Make the react entry point import- and render-safe in Node; verify `src/react/ssr.test.ts` in the Node project named for the server rendering safety rule: `renderToString` of the mount component yields an inert container and no browser global is read, and `src/architecture.test.ts` and `src/view/entry-points.test.ts` still pass with react re-exporting only its own names

## 4. Anchored overlay and controls (react)

- [ ] 4.1 Implement `NodeOverlay` (portal into an attached slot, hide and callback when the node is absent, dispose on unmount); verify `src/react/node-overlay.browser.test.ts` named for the anchored node overlay rule and the focus stability rule for "Context inside the overlay", "Overlay unmount" and "Anchored node removed"
- [ ] 4.2 Input isolation through the React overlay; verify the same file named for the anchored node overlay rule and the input scoping rule "Text field keeps its keys": Delete and a bound letter in a focused input leave the selected node and graph unchanged, and a pointer press on the content starts no gesture
- [ ] 4.3 Overlay tracking and wheel behavior; verify `src/view/overlay-wheel.browser.test.ts` named for the overlay placement rule "Wheel over overlay content" (no zoom over content, zoom over empty overlay) and a React test named for the anchored node overlay rule "Overlay follows the node" across pan, zoom and node move; adjust the overlay layer's wheel handling if the first run fails and record the outcome in `notes.md`
- [ ] 4.4 Implement the `ViewControls` panel (zoom in, zoom out, fit, lock; bottom-left default placement, per-button opt-out); verify `src/react/controls.browser.test.ts` named for the view controls rule for "Fit button", "Lock toggle" and "Zoom limits respected", and that buttons disable when their command is unavailable
- [ ] 4.5 Add the view lock: `locked` mount option, `view.locked`, `view.setLocked`, change notification, editing tools and commands unavailable with a reason while locked, `useViewLocked()` hook; verify `src/view/view-lock.test.ts` named for the view lock rule that move, connect, route edit, delete and paste do nothing and report the reason while pan, zoom, fit, selection and hover still work, that unlocking restores them, and that no history entry or serialized state is produced

## 5. Example and docs

- [ ] 5.1 Add `examples/react` (mount, inspector from selection, toolbar from availability and history, a hover popover via `NodeOverlay`, controls) with its tsconfig inclusion; verify `npm run typecheck` passes and the example builds with `npm run demo:build`-style Vite config
- [ ] 5.2 Write `docs/guide-react.md` (hooks, subscription granularity per the subscription granularity rule, option remount rules, overlay scope and limits) and update `docs/architecture.md` (react layer no longer "planned"); verify `grep -n "subscription granularity" docs/guide-react.md` finds the granularity table and the links resolve
- [ ] 5.3 Run `npm run lint`, `npm run typecheck`, `npm test`, `npm run test:browser`, `npm run build`; verify all pass and `dist/react` exports only react names plus the documented hooks

## Traceability

Every MUST above is linked to a test naming its rule: the React provider and hooks, subscription granularity, Strict Mode safety, server rendering safety, the anchored node overlay and view controls (tasks 3 and 4), hover event and hover state (task 2), overlay placement (tasks 1.4, 4.3), initial fit and zoom limits (tasks 1.2, 1.3, 4.4), view lock (tasks 4.4, 4.5).
