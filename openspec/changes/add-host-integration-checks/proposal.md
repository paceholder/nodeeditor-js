## Why

Hosts that embed the editor in an application shell (own selection panels, own shortcuts, a
palette outside the canvas, a bundler of their own) depend on behavior that the specs imply
but nothing proves: runtime styling, port targets and normals, coordinate conversion,
selection echo filtering, scoped shortcuts, packaging, and performance at typical sizes. These
are verification-type items. This change checks each one in the demo and in browser tests
first, then fixes only what fails, and records known limits.

## What Changes

- Style from the host: verify per-connection stroke colour, width and dash from the record
  payload or a host function, switchable at runtime without rebuilding the model; selected and
  hovered node styling through `NodePaintInput.state` with a documented painter-wrapper pattern;
  invisible port glyphs with a large capture target; runtime light/dark theme switch (VIS-01,
  PRT-05, REN-01). Fix gaps; add VIS-05.
- Port targets and normals: verify corner and interior placements, explicit per-port normal,
  rotation and mirror moving the normal, orthogonal router leaving along the normal, and
  CSS-pixel capture radius independent of glyph (PRT-05, PRE-01, GEO-05, ROU-01). Add PRT-05a
  only if an explicit normal or radius cannot be given today.
- Packaging: verify `dist/` output resolves in a fresh consumer project (Vite + TypeScript,
  React 19 peer, `sideEffects: false`), document a consumption path (link or registry), and
  settle `private`/version (PKG-01, PKG-05, PKG-06, PKG-09).
- Coordinate conversion: verify `view.clientToWorld` in a scrolled, transformed and CSS-scaled
  container and in an embedded WebView; ship one example creating a node at a pointer-up
  position from outside the view using pointer events only (PKG-04, PKG-10).
- Demo checks: marquee on partially covered nodes; programmatic selection by ID and echo
  filtering (INT-15); delete as one history entry including attached connections (INT-08);
  focus-scoped and unbindable shortcuts (INT-06, INT-16); pointer capture and pen/touch drags;
  50 to 500 node benchmark run against the comparison library (PERF-07); rounded bends and port
  offset on the orthogonal router; accessibility limits recorded.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `canvas-view`: VIS-05 per-connection runtime style.
- `ports`: PRT-05a explicit normal and capture radius on image-symbol placements (only if the
  check finds them missing).
- `interaction`: INT-15 selection change origin; INT-16 shortcut unbinding and focus scope.
- `packaging`: PKG-09 consumable build; PKG-10 external-drop example and coordinate conversion.
- `performance`: PERF-07a typical host sizes.

Requirement IDs implemented or refined: VIS-01, VIS-05, PRT-05, PRT-05a, PRE-01, GEO-05,
INT-02, INT-06, INT-08, INT-15, INT-16, ROU-01, PKG-01, PKG-04, PKG-05, PKG-06, PKG-09,
PKG-10, PERF-07, PERF-07a.

## Impact

- Code: small fixes only where a check fails (view render/paint, view input, tools, package.json,
  tsup config); examples (`examples/plain-js`, one new consumer smoke project under `examples/`);
  tests; docs (`docs/guide-view.md`, `docs/interaction.md`, `docs/architecture.md` known limits).
- Added IDs are provisional until the checks confirm a gap; unneeded ones are dropped from the
  delta before archive.

## Out of Scope

- React integration, hover events, anchored overlay, docking, host-owned authority, async
  policy, reconnect tool, gesture-intent decoding, fit/zoom controls (separate changes).
- Components inside nodes, backend protocols, domain connection rules, host theme tokens.
- Full accessibility (screen-reader parity, keyboard connection); only the existing reduced
  scope is recorded as a known limit.
- Registry publication and release automation; only the consumption path and metadata decision.
- Safari/Firefox engine runs and real device WebView testing beyond what is available locally;
  results that cannot be obtained are recorded as unverified.
