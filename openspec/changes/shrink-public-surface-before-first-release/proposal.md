## Why

The pre-release audit found the public surface large for a first release: 313 exported
names on the core entry, 135 on the view entry, 143 on the advanced view entry and 26 on
the React entry (values and types, as the compiler counts them). Every exported name is a
promise after the first release. The package has no consumers and the owner approved
breaking changes, so now is the cheapest time to drop names that only the library's own
modules use. The earlier tidy-up of the core entry removed four names and listed about
forty more as candidates for a later decision; this change takes that decision for all
four entries.

## What Changes

- **BREAKING** Names judged internal are removed from their entry file (they stay in the
  module that defines them): low-level math, finiteness predicates, record-check helpers,
  reserved ID kinds and the default-limit helper on the core entry; resize, auto-pan,
  long-press, clipboard-placement and command-registration internals on the advanced view
  entry; the auto-pan defaults constant on the view entry.
- Every other candidate is kept, with a one-line reason recorded in `notes.md`.
- A repository test fails when a removed name reappears on any entry, or when the number of
  exported names, or of runtime values in the built entry, grows past the settled ceiling.
- New requirement "Entries export only names a host needs" in the packaging capability.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `packaging`: new requirement "Entries export only names a host needs".

## Impact

- `src/core/index.ts`, `src/core/space/geometry/index.ts`, `src/view/index.ts`,
  `src/view/advanced.ts`, and the two core tests that read the removed names.
- New test `scripts/public-surface.test.ts`.
- No example, README snippet or guide used a removed name.

## Out of Scope

- Splitting a `core/advanced` entry for geometry math: no new entry points.
- Removing exported types that appear in the signatures of kept functions, even when no
  example names them: a host needs to write them in its own code.
- Removing requirement codes from declaration comments (a separate audit item).
