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
  invisible port glyphs with a large capture target; runtime light/dark theme switch (the theme tokens and overrides rule,
  the rule that glyph, target, label and anchor are separate and the independent extension contracts rule). Fix gaps; add the per-connection style at runtime rule.
- Port targets and normals: verify corner and interior placements, explicit per-port normal
  (hosts know each port's side), rotation and mirror moving the normal, orthogonal router
  leaving along the normal, and CSS-pixel capture radius independent of glyph (the rule that glyph, target, label and anchor are separate and the image-symbol node preset rule,
  the screen-space tolerances rule and the built-in route modes rule). Add the image-symbol port normals and capture radius rule with the explicit normal if it cannot be given today.
- Symbols from host assets: SVG data URIs of different sizes, tinted by the host, each tint
  under its own asset key, placement fractions in the picture's own coordinates.
- Packaging: verify `dist/` output resolves in a fresh consumer project (Vite + TypeScript,
  React 19 peer, ESM only, types shipped, `sideEffects: false`); a git dependency pinned to a
  tag or commit builds `dist/` on install; document that path; `private: true` stays until a
  registry decision (a temporary decision recorded in the design, not a requirement).
- Coordinate conversion: verify `view.clientToWorld` in a scrolled, transformed and CSS-scaled
  container and in an embedded WebView; ship one example creating a node at a pointer-up
  position from outside the view using pointer events only.
- Fit on first content: `initialFit` gains a value that fits once when the first non-empty
  content appears after mount, for hosts that fill an empty view later (the fit on first content rule, provisional;
  the initial fit and zoom limits rule stays as it is).
- Label legibility: node titles and port labels are left out below configurable zoom
  thresholds, the way ports already are; no font-size clamping and no effect on
  picking (provisional).
- Demo checks: the `marquee` option's three values (`direction` stays the default, `intersect` selects
  partly covered nodes in both drag directions); programmatic selection by ID, the selection `origin` (`"user"`, `"api"` or `"model"`; calls
  default to `"api"`, built-in tools pass `"user"`, removals from the model report `"model"`),
  carried on the view's `selection` event and by the React selection hook, and unknown IDs
  ignored; delete as one history entry including attached connections; focus-scoped,
  unbindable and rebindable shortcuts, host bare keys, text fields never trigger commands;
  pointer capture and pen/touch drags; 50 to 500 node benchmark, plus a 2000
  node stress case, on the harness from the React Flow comparison rule; rounded bends and port offset on the
  orthogonal router; accessibility limits recorded.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `canvas-view`: per-connection runtime style by kind; host-supplied symbol images;
  fit once when the first content appears after mount (provisional); titles from the label hiding by zoom rule and
  port labels hidden below configurable zoom thresholds (provisional).
- `ports`: explicit normal and capture radius on image-symbol placements.
- `interaction`: selection change origin and unknown IDs; shortcut unbinding,
  bare keys, focus scope and host predicate; the selection rule gains scenarios for the three marquee
  modes (no default changes).
- `packaging`: consumable build and git install; external-drop example and
  coordinate conversion.
- `performance`: typical host sizes and a stress size.

Requirements implemented or refined: the theme tokens and overrides rule, the per-connection style at runtime rule, the rule that glyph, target, label and anchor are separate, the image-symbol port normals and capture radius rule, the image-symbol node preset rule and the screen-space tolerances rule,
the initial fit and zoom limits rule, the fit on first content rule, the level of detail rule, the label hiding by zoom rule, the selection rule, the input scoping rule, the one committed edit per gesture rule, the selection change origin rule, the shortcut unbinding and focus scope rule, the asset service with host resolver rule, the host-supplied symbol images rule, the built-in route modes rule, the ESM package with typed entry points rule, the examples rule and the no global side effects rule,
the published support and versioning policy rule, the consumable build rule, the external drop example rule, the React Flow comparison rule and the typical host sizes rule.

## Impact

- Code: small fixes only where a check fails (view render/paint, view input, tools, package.json,
  tsup config); examples (`examples/plain-js`, one new consumer smoke project under `examples/`);
  tests; docs (`docs/guide-view.md`, `docs/interaction.md`, `docs/architecture.md` known limits).
- Added requirements other than image-symbol port normals, host-supplied symbol images, selection change origin, shortcut unbinding and consumable build (fit on first content and label hiding by zoom among them) are provisional until the
  checks confirm a gap; unneeded ones are dropped from the delta before archive. Task 6.2
  enforces that every requirement left in the delta has a test naming its ID.
- Touches the React selection hook introduced by `add-react-integration` (it gains the
  origin), so apply this change after that one is archived.

## Out of Scope

- React integration, hover events, anchored overlay, docking, host-owned authority, async
  policy, reconnect tool, gesture-intent decoding, fit/zoom controls (separate changes).
- Components inside nodes, backend protocols, domain connection rules, host theme tokens.
- Full accessibility (screen-reader parity, keyboard connection); only the existing reduced
  scope is recorded as a known limit.
- Registry publication and release automation; only the consumption path (git dependency) and
  metadata decision.
- Safari/Firefox engine runs and real device WebView testing beyond what is available locally;
  results that cannot be obtained are recorded as unverified.
