# AGENTS.md

This file provides guidance to coding agents when working with code in this repository.

## Project status

Early bootstrap, spec-driven with OpenSpec. Requirements live in `openspec/specs/`
(one capability per directory); planned work lives in `openspec/changes/`. Settled
product decisions and code conventions are in the `context` of `openspec/config.yaml` —
read it before designing anything. `docs/architecture.md` explains the design (with
QtNodes comparisons) and `docs/guide-*.md` walk through implemented code; update them when
a change alters what they describe. `docs/archive/` holds the original AI-drafted
baseline and research notes: historical input only, not authoritative.

Requirements (for example Headless in-memory model or Local undo and redo) are stable — reference them in
tests, never in commit messages. Specs are written in plain English and must stand alone:
define every term in the spec itself and never rely on `docs/archive` or another document
the reader would have to open. Every MUST needs linked evidence (a test naming its ID).

Delivery slices A–E proceed in order (Slice A: headless model, patches/history, commands
and policy, graph snapshot, geometry and spatial index, minimal Canvas2D view and basic
tools, performance baseline). Use `/opsx:apply <change>` to implement a change and
`/opsx:archive` when it is done. Don't silently change a requirement or settle a decision
that isn't recorded — ask.

Library files stay application-neutral: no product names or host-specific backend
details; examples use generic wording ("physical-system schematic", "image-symbol node").

The sibling directory `../nodeeditor` is the C++/Qt predecessor (QtNodes) and is useful
as a behavioral reference (model/view split, `AbstractGraphModel`, geometry/painter
abstractions, undo commands). Do not port its design wholesale: the spec explicitly
rejects role-based variant lookups (`NodeRole`/`QVariant`-style APIs), index-based port
addressing, and a model base class every host must inherit.

## Commands

```bash
npm install
npm run build        # tsup → dist/{core,view,react}/index.js + .d.ts (ESM only)
npm run typecheck    # whole project + core-only pass with no DOM lib + examples
npm test             # vitest, Node project (headless tests)
npm run test:browser # vitest browser mode in the installed Google Chrome (*.browser.test.ts)
npm run demo         # Vite dev server for examples/plain-js with live reload
npm run demo:build   # static production build of the demo
npm run demo:preview # serve the built demo locally
npx vitest run src/core/index.test.ts   # single file
npx vitest run -t "pattern"             # by test name
npm run lint         # biome check
npm run format       # biome check --write
```

Node 22+ is the baseline for headless tests/examples.

TypeScript is pinned to 6.x on purpose: TypeScript 7 (native compiler) has no JS
compiler API, which tsup's declaration build needs. Biome ignores `*.md` so it never
reformats the spec.

## Architecture

Single ESM package (no monorepo split required) with four entry points, layered
strictly downward:

| Entry                          | Source                 | May depend on                                 |
| ------------------------------ | ---------------------- | --------------------------------------------- |
| `nodeeditor-js`                | `src/core/index.ts`    | nothing browser- or React-specific            |
| `nodeeditor-js/view`           | `src/view/index.ts`    | core + DOM/Canvas (only after explicit mount) |
| `nodeeditor-js/view/advanced`  | `src/view/advanced.ts` | same as view                                  |
| `nodeeditor-js/react`          | `src/react`            | view + React (peer dependency)                |

`view` exports what a host needs to mount and customize an editor; `view/advanced`
exports the building blocks (frame scheduler, DOM input, tool router, layer painters,
fallbacks). Each public name has exactly one entry point, and `view` does not re-export
core (checked by `src/view/entry-points.test.ts`).

Inside each entry the folders are layers, lowest first. A module imports from its own
layer or a lower one, never from above:

| Layer (rank)          | Path                                                            |
| --------------------- | --------------------------------------------------------------- |
| core/base (0)         | `src/core/base/`: result, ids                                   |
| core/data (1)         | `src/core/data/`: model, node-types, patch                      |
| core/edit (2)         | `src/core/edit/`: policy, capabilities, commands, history, adapter, events |
| core/space, core/io (3) | `src/core/space/`: geometry, spatial-index, scene; `src/core/io/`: snapshot (siblings, never import each other) |
| core/facade (4)       | `src/core/graph-model.ts`, `src/core/index.ts`                  |
| view/platform (5)     | `src/view/platform/`: dom, frame scheduler, viewport, model binding, render stats |
| view/render (6)       | `src/view/render/`: primitives, theme, assets, registries, presets, paint |
| view/interact (7)     | `src/view/interact/`: selection, tools, input, commands, overlay |
| view/mount (8)        | `src/view/{view-types,view-editing,mount-view,index,advanced}.ts` |
| react (9)             | `src/react/`                                                    |

`src/architecture.test.ts` holds this table and fails on a wrong-way import, a runtime
import cycle between files, view or react reaching core other than through
`src/core/index.ts`, or a file that matches no layer. Test-support files (fixtures,
harnesses) are listed there and may reach anywhere. A new folder must be added to the
table deliberately.

Layering rules that are release gates in the spec:

- **Core is headless**: no DOM types, browser globals,
  Canvas/Path2D, or React imports. `tsconfig.core.json` typechecks `src/core` with
  `lib: ["ES2022"]` and no `@types`, so a DOM reference there fails `npm run typecheck`.
- **No side effects at import time**: view/react modules must be
  importable during SSR; browser setup happens on mount. `sideEffects: false`.
- **Model adapter owns state and history**: the local in-memory
  document is one adapter; external hosts plug in their own. Views never keep a
  second authoritative graph — the scene is a derived projection plus indexes/caches.
- **Patches are the core primitive**: a command (intent) is planned into
  a patch (`+` add / `-` remove / `~` update with old and new values), submitted with an
  operation ID and base revision, and applied atomically by the adapter → `{ ok: true }`
  or `{ ok: false, rejection }`. Undo applies the inverse patch. Previews live in the
  pending layer and are never serialized. One completed gesture = one history entry.
- **Independent extension contracts**: node painter, port glyph,
  geometry, routing, path painter/picker, connection policy, and tools are separate
  registrations; changing one must not require touching another.
- **Stable identity**: entities are addressed by opaque stable IDs,
  never by array index, label, or position; deleted IDs are never reused.
- **Deterministic ordering**: no incidental `Map`/object iteration order in
  painting, selection tie-breaks, or serialization.

## Code conventions

- Files stay small (100–300 lines): one node type, tool, or painter per file.
- Narrow interfaces, exhaustive discriminated unions, no `any` in public APIs or hot paths.
- No metaprogramming and no class inheritance hierarchies — composition and registries.
- No module-level singletons; every instance owns its state and `dispose()`.
- Interaction tools are hand-rolled state machines: discriminated-union states plus a pure
  transition function, testable headlessly.
- Failures that callers can expect (policy rejection, invalid input) return Result objects;
  throw only for programmer misuse.
- Tests name the requirement IDs they cover in `describe`/`it` titles.
