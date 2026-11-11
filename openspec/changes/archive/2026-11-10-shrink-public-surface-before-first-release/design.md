# Design

## Context

The four entries are the whole public contract. Each exported name must be one a host
needs to mount, configure or extend the editor. The extension contracts (node painter,
port glyph, geometry, routing, path painter and picker, connection policy, tools, model
adapter) are public, so what a host needs to write one of them stays exported.

## The rule

A name is removed from its entry only when all of these hold:

1. No example, benchmark, script, README or guide text names it.
2. No other entry or layer reaches it through that entry. View and React reach core only
   through `src/core/index.ts` (the architecture test), so any name they import from it
   stays.
3. No test of the entry's public contract needs it, including the namespace-style tests
   (`import * as core`) and `src/view/entry-points.test.ts`, which names the tool-writing
   and mounting contracts.
4. It is not what a host plausibly needs to write a custom geometry, router, painter,
   policy, tool or adapter: shape builders and queries, path builders and pickers,
   record validators symmetrical to a kept one, load phases, key ordering, format
   constants, painter helpers and tool constants stay.

The removed name stays exported from the module that defines it, so the library itself
is unchanged. Removal is a deletion from the entry file (or from the barrel an entry
re-exports with `export *`); the one-entry-point-per-name rule is unaffected.

## Types

A type is removed only together with the single function it served (for example the
long-press state types with the long-press step). Types named in the signatures of kept
functions stay even when no example names them, because a host writes them in its own
annotations. This is why the name counts fall less than the value counts on the core and
view entries.

## Exceptions found while applying the rule

- `NO_MODIFIERS` and `DEFAULT_TOOL_OPTIONS` have no use outside their modules but
  `entry-points.test.ts` names them as part of the tool-writing and tool-configuring
  contract, so they stay.
- `nodeTransform` and `checkJson` are used by contract tests of the core entry and stay.

## The guard

`scripts/public-surface.test.ts` builds the JavaScript, imports each built entry and
checks that the removed names are absent from the compiler's export list and from the
built exports, and that the number of exported names and of built runtime values per
entry is at or below the ceiling written in the test. A change that adds an export raises
the ceiling in the same commit and explains the name in its notes; that is the review
point. The test does not try to prove that every exported name has a documented purpose;
the ceiling and the notes carry that review.
