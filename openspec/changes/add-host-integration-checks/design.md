## Context

Each item is a claim the specs make or imply but no test pins down for an embedding host.
Existing mechanisms: per-type and per-entity style overrides (VIS-01), `captureRadiusPx` in
port layout (PRT-05, GEO-05), marquee modes by drag direction today (contain left-to-right,
intersect right-to-left), `SelectionModel.on`, `Keymap` bindings with a replaceable keymap
option, `cornerRadius` in the orthogonal router, `view.clientToWorld`, and the bench suites.

## Goals / Non-Goals

**Goals:** a verified answer per item; minimal fixes; each fix covered by a test naming its ID;
known limits written down.
**Non-Goals:** the items listed under Out of Scope in the proposal.

## Decisions

- D1 Verify-then-fix: every check is first a test or demo observation. A passing check stays as
  a regression test; a failing check gets the smallest fix and a note in `notes.md`.
- D2 Style: prefer existing per-entity overrides and a host style function over new model
  fields. A runtime change repaints only the scene layer (REN-04). New API only if overrides
  cannot express dash/width/colour per connection.
- D3 Echo filtering: selection events gain an `origin` of `user` or `api`. This is additive;
  open question below on naming.
- D4 Shortcut scope is already per focused root (INT-06). Add only unbinding by command or chord
  if the `keymap` option cannot express it today.
- D5 Packaging smoke: a throwaway consumer project under `examples/` that installs the packed
  tarball (`npm pack`) and builds with Vite and `tsc`; run by a script, not part of `npm test`.
- D6 Performance: record numbers for 50, 200 and 500 node fixtures with the existing bench
  harness; no new budgets unless the result is far outside the existing ones.
- D7 WebView, pen and touch: browser tests cover synthetic pointer events with
  `pointerType` pen and touch in Chrome; real WebView runs are manual and recorded.

## Risks / Trade-offs

- New IDs may turn out unnecessary; they are dropped in that case (see proposal).
- Synthetic pointer tests do not prove WebView behavior; recorded as a limit.

## Open Questions

- Origin field name and values for selection events (`origin: "user" | "api"` assumed).
- Keep `private: true` until a registry decision, or drop it now? Requires the owner.
- Whether a bench comparison library run for 50 to 500 nodes needs the comparison harness set up
  here or reuses the existing PERF-07 report.
