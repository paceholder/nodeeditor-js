## Why

A pre-publish audit found problems in the React
layer and in packaging and release that must be fixed before the first npm release. A
published version's README cannot be changed, the built React entry fails in a server
component, an inline connection chooser aborts its own pending choice, and the release
workflow can publish from any commit.

## What Changes

- README rewritten for the registry page; CHANGELOG, SECURITY and CONTRIBUTING files; a
  note on TypeScript module resolution; correct repository URL and `author`.
- The built React entry starts with the `"use client"` directive (built entry only).
- React layer: a stable chooser trampoline, state hooks no longer loop on a fresh nested
  value, viewport and selection survive a hide/show remount, a `ref` form of `onReady`,
  hooks compare command arguments by value, a hydration test, and the guides and example
  recommend `useState(() => ...)` for the model.
- Release workflow: protected `release` environment, tagged commit must be on `main`,
  actions pinned by commit SHA, exact npm version, `next` dist-tag for pre-release
  versions; read-only permissions in CI.
- `@types/react` as an optional peer dependency; one source-map comment per emitted file.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `packaging`: registry README, client directive, guarded release, project policy files,
  one source-map comment.
- `react-integration`: stable chooser, change-driven state hooks, remount continuity,
  ref form, value-compared command arguments, hydration.

## Impact

`src/react`, `examples/react`, `README.md`, `docs/`, `package.json`, `tsup.config.ts`,
`.github/workflows/`, root files, `scripts/`.

## Out of Scope

- `src/core` and `src/view` (the abort logic behind the chooser fix is not edited).
- Stripping requirement codes from shipped declaration comments (since settled: the codes were removed from the source and the history).
- Reducing the public API surface (owner decision pending).
- Pushing, tagging or publishing.
