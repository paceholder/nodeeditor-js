# Spec coverage tracker

Live tracker of how the archived baseline (`docs/archive/node-editor-library-design.md` and `docs/archive/research-notes.md`) maps onto
the current specs. The archive stays untouched; this file records what was carried over, trimmed or lost.

The specs in `openspec/specs/` and `openspec/config.yaml` are the source of truth. This file is derived input only.
Archive line numbers (`L48-52`) point into the archive file as it is today. Items marked deliberately dropped cite where the trim is recorded.

How to update: when a change closes a gap, flip its box, put the covering requirement ID on the line, remove it from the Gaps list, and
refresh the summary table. When a new gap is found, add a line to its section and to Gaps. Do not rewrite a requirement to fit this file.

Status legend:

- `[x]` covered by a spec requirement
- `[~]` partly covered
- `[ ]` missing
- `[-]` deliberately dropped (trim recorded in config.yaml or a spec)

## Summary

| Section | Covered | Partly | Missing | Dropped | Total |
|---|---|---|---|---|---|
| 1. Product contract and reading guide | 9 | 2 | 1 | 1 | 13 |
| 2. Design principles | 10 | 1 | 0 | 0 | 11 |
| 3. Shared vocabulary and invariants | 13 | 2 | 0 | 0 | 15 |
| 4. Graph model and state ownership | 23 | 1 | 1 | 1 | 26 |
| 5. Node, port, and appearance requirements | 20 | 0 | 0 | 0 | 20 |
| 6. Connections and extensible port signatures | 30 | 2 | 0 | 0 | 32 |
| 7. Geometry, paths, and routing | 20 | 0 | 0 | 0 | 20 |
| 8. Interaction, docking, and junctions | 21 | 0 | 0 | 0 | 21 |
| 9. Groups, replacement, and clipboard | 9 | 0 | 0 | 0 | 9 |
| 10. React integration and renderer boundaries | 14 | 2 | 1 | 0 | 17 |
| 11. Transactions, validation, history, and synchronization | 14 | 0 | 0 | 0 | 14 |
| 12. Serialization, import, and application data | 8 | 0 | 0 | 0 | 8 |
| 13. Accessibility, diagnostics, trust, and lifecycle | 13 | 1 | 1 | 2 | 17 |
| 14. Packaging, platform, and public API | 9 | 1 | 0 | 0 | 10 |
| 15. Performance and capacity acceptance | 15 | 4 | 4 | 5 | 28 |
| 16. Detailed use cases | 11 | 8 | 0 | 0 | 19 |
| 17. Verification strategy and traceability | 2 | 3 | 0 | 0 | 5 |
| 18. R1 completion and implementation sequencing | 4 | 4 | 0 | 1 | 9 |
| 19. Explicit decisions still open | 4 | 3 | 0 | 0 | 7 |
| Research notes | 43 | 6 | 2 | 6 | 57 |
| **Total** | 292 | 40 | 10 | 16 | 358 |

## 1. Product contract and reading guide

- [x] L48-52 "without implementing its own viewport, selection system, connection gestures, or undo" -- INT-01, INT-02, INT-04, TXN-07, PKG-08
- [x] L54-59 Two equally supported modes: local document and external model -- ADP-02, MOD-02
- [x] L61-63 "React is a supported integration surface, not a requirement" -- REA-02, PKG-03
- [x] L62-63 Canvas symbols and React content have separate performance envelopes -- REN-06, PERF-02, NOD-06
- [x] L67-73 MUST/SHOULD/MAY language, R1 meaning, stable IDs -- openspec/config.yaml rules.specs (ID prefix, "(SHOULD)" suffix, UC refs); MAY
      handled per-requirement (GRP-04)
- [~] L75-77 "Changes to MUST scope require an explicit revision" -- Only a process rule in AGENTS.md ("don't silently change a requirement"); not a
      spec requirement
- [~] L93-96 Library does not execute workflow, propagate values, schedule, interpret units, run imported code -- SAFE-01, SAFE-02, UX-06, provided-
      values Purpose cover code/values; no consolidated non-goals (workflow execution, scheduling, units, auth, backend)
- [x] L95 "resolve multi-author conflicts"  excluded -- ADP-04
- [x] L95-96 Trusted renderers/codecs/policy callbacks run as host code -- SAFE-04, SAFE-02
- [ ] L98-100 Nested subgraph navigation, capability negotiation, graph execution, marketplace, mobile-first not R1 -- No non-goals list in specs
- [-] L99-100 Complete screen-reader representation of large graphs not R1 -- config.yaml "accessibility reduced to keyboard shortcuts"; UX-01, UX-02
- [x] L100-101 Flat groups, dynamic ports, keyboard editing, accessible DOM controls in scope -- GRP-01, PRT-02, UX-01, UX-02
- [x] L101-102 Automatic layout integration separate from routing -- VIS-04 (external layout proposes batch of positions), ROU-*

## 2. Design principles

- [x] L108 Application-independent meaning; host defines payloads/semantics -- CON-01, UX-06, config.yaml neutrality
- [x] L109 Model/view separation, multiple views on one model -- MOD-01, MOD-10
- [x] L110 Useful defaults, replaceable policies -- CON-01, ADP-02, PKG-08
- [x] L111 Stable identity across port insert/reorder/rename/move -- MOD-03, PRT-01, PRT-02
- [x] L112 Independent extension contracts -- REN-01, NOD-08
- [x] L113 Explicit reversible edits; failure leaves no partial change -- PAT-02, PAT-03, PAT-07, NOD-09a
- [x] L114 Capacity claims name profile, workload, hardware, evidence -- PERF-01, PERF-02
- [x] L115 Rendering displays, commands request, adapter owns state -- ADP-01, PAT-04, TXN-08
- [~] L117 "typed contracts rather than unstructured property lookups" -- Only in AGENTS.md/config code conventions; no spec requirement
- [x] L117-119 Customization must not require rewriting viewport or built-in tools -- REN-01, PKG-08
- [x] L121-122 Not restricted to input-left/output-right rectangular nodes -- PRT-03, NOD-02, NOD-03

## 3. Shared vocabulary and invariants

- [x] L128-145 Vocabulary: Host, Graph model, View document, Scene, Node, Port, Member -- MOD-04 (durable view data), ADP-01, SIG-02, PRT-*
- [x] L136-138 Provided value, Connection plan, Assembly -- REF-01, CON-04, SIG-06
- [x] L139-141 Route (derived vertices vs persistent constraints), Junction, Group -- ROU-03, JNC-01..06, GRP-01
- [x] L142 Gesture definition (commit or cancellation) -- INT-05
- [x] L143 "Revision: not necessarily a number" -- ADP-06 (ordering declared by adapter, not token text)
- [x] L144 Capability separate from selection or visibility -- MOD-11
- [x] L148 IDs are not labels, offsets, screen positions -- MOD-03
- [x] L149 Direction is not geometry -- PRT-03
- [x] L150 Connection existence independent of route length/overlap -- CON-08, ROU-12
- [x] L151 "A crossing is not a junction" -- JNC-01
- [~] L151 "hiding a path does not delete a connection" -- ROU-12 and LAY-04 (low detail keeps attachments) imply it; no explicit statement
- [x] L152-153 One cable can carry multiple bindings, each inspectable -- SIG-07
- [x] L154 Reading provided value creates no ordinary edge -- REF-02
- [x] L155 Same model in two views does not duplicate connections -- MOD-10
- [~] L156 Rendering and picking do not mutate data or run app logic -- REN-02, UX-06 cover renderer objects and explicit commands; no explicit
      "render/pick are side-effect free" rule

## 4. Graph model and state ownership

- [x] L162 MOD-01 headless in-memory model -- MOD-01
- [x] L163 MOD-02 external adapter -- MOD-02
- [x] L164 MOD-03 stable IDs, deleted IDs not reused, undo restores same -- MOD-03, MOD-03a
- [x] L165 MOD-04 payload/view/ephemeral/cache separation -- MOD-04
- [x] L166 MOD-05 atomic change, consistent notification -- MOD-05
- [x] L167 MOD-06 reset and incremental with revision continuity -- MOD-06, ADP-06
- [x] L168 MOD-07 indexed queries -- MOD-07
- [x] L169 MOD-08 deterministic ordering -- MOD-08
- [x] L170 MOD-09 structured errors, reject before change -- MOD-09
- [x] L171 MOD-10 independent views, history in adapter -- MOD-10
- [x] L172 MOD-11 read-only and capabilities -- MOD-11
- [-] L173 MOD-12 aliases (SHOULD) -- config.yaml "MOD-12 aliases dropped"
- [x] L174 MOD-13 immutable snapshots -- MOD-13
- [~] L174 MOD-13 declare ownership/lifetime of snapshots, descriptors, subscription values -- MOD-13 has only a snapshot-lifetime scenario;
      descriptors/subscription values not covered
- [ ] L174 "external adapters must announce changes rather than silently mutating" -- Nothing in model-adapters; add to ADP-06 or MOD-13
- [x] L176-177 Local model is a convenience adapter, not a base class -- MOD-02, ADP-02, AGENTS.md
- [x] L177-179 Concrete typed queries; host need not expose full object tree -- MOD-02, ADP-05
- [x] L181-186 Structural integrity vs application validity; no silent retarget/drop -- MOD-09a
- [x] L186 Existing invalid-but-safe state diagnosed, not rewritten -- MOD-09a, SER-05
- [x] L194-197 Library always keeps read model; authority via adapter -- ADP-01, ADP-02
- [x] L201 Pending layer separate from confirmed state -- TXN-02
- [x] L202 "submit(plan, opId, baseRevision) returns a result or a promise" -- TXN-01, ADP-06
- [x] L203 Inbound reset or changes@revision; gap triggers resync -- ADP-06, MOD-06
- [x] L204 History in adapter: local stack or host-owned -- TXN-07, TXN-08
- [x] L218-226 Rationale: no remote-only without read model; no library-only authority -- ADP-01, MOD-02
- [x] L227-228 Tools written once against adapter contract, sync or delayed -- ADP-02

## 5. Node, port, and appearance requirements

- [x] L236 NOD-01 type registration -- NOD-01
- [x] L237 NOD-02 custom shapes, portless nodes -- NOD-02
- [x] L238 NOD-03 sizes and layouts -- NOD-03
- [x] L239 NOD-04 rotation, mirroring, resize, shared transform -- NOD-04, NOD-04a, GEO-02a
- [x] L240 NOD-05 independent labels/status -- NOD-05
- [x] L241 NOD-06 React content, form input not graph commands -- NOD-06, REA-03
- [x] L242 NOD-07 unknown-type/missing-asset placeholders -- NOD-07, SER-05, AST-04
- [x] L243 NOD-08 independent registrations -- NOD-08
- [x] L244 NOD-09 creatable types, create at position, failing factories -- NOD-09, NOD-09a
- [x] L248 PRT-01 stable port/member addressing -- PRT-01
- [x] L249 PRT-02 atomic dynamic ports -- PRT-02
- [x] L250 PRT-03 independent direction/cardinality/side -- PRT-03
- [x] L251 PRT-04 attachment limits -- PRT-04
- [x] L252 PRT-05 glyph/target/label/anchor separate -- PRT-05
- [x] L253 PRT-06 distinct target states -- PRT-06
- [x] L254 PRT-07 preview removal effects -- PRT-07
- [x] L260 VIS-01 theme tokens and overrides -- VIS-01
- [x] L261 VIS-02 z-order and interactive order -- VIS-02
- [x] L262 VIS-03 body/painted/hit bounds -- VIS-03
- [x] L263 VIS-04 alignment, spacing, snap guides (SHOULD) -- VIS-04

## 6. Connections and extensible port signatures

- [x] L269-273 Default policy: output-to-input, equal types, one per input, no self-loop/duplicate, cycles ok -- CON-01a
- [~] L275-277 "Undirected ports require an enabled host/type policy" -- CON-01b makes undirected accepted by default; opt-in gate dropped. Needs a
      decision or explicit note in connection-policy
- [x] L277-278 Directed and undirected coexist in one graph -- CON-01b
- [x] L281 CON-01 documented default, replaceable -- CON-01
- [x] L282 CON-02 self-loops, parallel, cycles, undirected by policy -- CON-02
- [x] L283 CON-03 one policy for all input routes -- CON-03
- [x] L284 CON-04 four outcomes, not Boolean -- CON-04
- [x] L285 CON-05 revalidate at commit -- CON-05
- [x] L286 CON-06 no implicit conversions -- CON-06
- [x] L287 CON-07 old binding survives failed reconnect -- CON-07
- [x] L288 CON-08 identity independent of path/style/endpoint order -- CON-08
- [x] L292-295 Composite port: many typed members, one socket; library does not interpret meaning -- SIG-00, composite-signatures Purpose
- [x] L302-306 Required structural member vs provided value vs required value -- SIG-00, SIG-04
- [x] L308-310 Port may have single member, only values, or none -- SIG-00
- [x] L314 SIG-01 stable schema/version ids and member keys -- SIG-01
- [x] L315 SIG-02 opaque and mapped members -- SIG-02
- [x] L316 SIG-03 mandatory members mapped; full-match exact -- SIG-03
- [x] L317 SIG-04 required values one provider -- SIG-04
- [x] L318 SIG-05 plan preview; ambiguity needs choice -- SIG-05, INT-12
- [x] L319 SIG-06 atomic assembly; unpack explicit -- SIG-06
- [x] L320 SIG-07 collapsed/expanded lanes -- SIG-07
- [x] L321 SIG-08 signature separate from policy -- SIG-08
- [x] L323-330 Strict composite policy formula -- SIG-03, SIG-04, CON-01
- [~] L332 "Different keys never match merely because labels are equal" -- SIG-01 (keys independent of label); no explicit rule that
      equality/mapping must be declared by schema/policy
- [x] L333-334 "Optional" never lets a missing required value get a default -- SIG-04
- [x] L344 REF-01 identity and ownership -- REF-01
- [x] L345 REF-02 reference binding distinct -- REF-02
- [x] L346 REF-03 many readers, one source; cost documented -- REF-03
- [x] L347 REF-04 targets without visible ports -- REF-04
- [x] L348 REF-05 host source scheme; unavailable/pending/stale -- REF-05
- [x] L349 REF-06 ownership preserved -- REF-06
- [x] L351-355 Displaying a value creates no executable binding; library does not inspect computation -- REF-02, UX-06, provided-values Purpose

## 7. Geometry, paths, and routing

- [x] L362 GEO-01 named spaces -- GEO-01
- [x] L363 GEO-02 one transform convention, persist world values -- GEO-02, GEO-02a
- [x] L364 GEO-03 scroll/resize/zoom/DPI -- GEO-03
- [x] L365 GEO-04 broad then precise phase -- GEO-04
- [x] L366 GEO-05 CSS-pixel tolerances -- GEO-05
- [x] L367 GEO-06 finite ranges, degenerate inputs -- GEO-06
- [x] L373 ROU-01 straight, bezier, orthogonal; separable -- ROU-01
- [x] L374 ROU-02 custom path contract, no SVG/Canvas-only types -- ROU-02
- [x] L375 ROU-03 waypoints, segment move, persisted separately -- ROU-03
- [x] L376 ROU-04 escape direction and clearance -- ROU-04, ROU-01b
- [x] L377 ROU-05 obstacle-aware routing, unresolved marked -- ROU-05
- [x] L378 ROU-06 complete/provisional/unroutable -- ROU-06
- [x] L379 ROU-07 locked constraints, stability, determinism -- ROU-07
- [x] L380 ROU-08 bounded invalidation -- ROU-08
- [x] L381 ROU-09 labels/arrowheads/dashes/lanes/diagnostics -- ROU-09
- [x] L382 ROU-10 bounded async routing -- ROU-10
- [x] L383 ROU-11 snap/label/bridge styles (SHOULD) -- ROU-11 (title lacks "(SHOULD)" suffix though text says not a gate)
- [x] L385-387 Path length/bends are presentation unless host makes a command; no implicit invocation -- ROU-12
- [x] L389-390 Bundled path hit identifies assembly vs member -- GEO-04a
- [x] L390-391 Coincident/parallel paths need deterministic disambiguation (e.g. chooser) -- GEO-04a, geometry scenario on chooser ordering

## 8. Interaction, docking, and junctions

- [x] L399 INT-01 pan, cursor zoom, fit, reset, focus -- INT-01
- [x] L400 INT-02 single/additive/toggle/marquee selection -- INT-02
- [x] L401 INT-03 group move, snap, suppression, locked -- INT-03
- [x] L402 INT-04 drag-to-connect, click-to-route, right-click -- INT-04
- [x] L403 INT-05 thresholds, capture, cancellation -- INT-05
- [x] L404 INT-06 scoped shortcuts, IME, wheel -- INT-06
- [x] L405 INT-07 same commands for menus/shortcuts -- INT-07
- [x] L406 INT-08 one committed edit per gesture -- INT-08, PAT-07
- [x] L407 INT-09 auto-pan SHOULD -- INT-09
- [x] L411 Docking: no merge of identities, no parent/child -- docking Purpose; DCK-02
- [x] L417 DCK-01 candidate preview, ranking, hysteresis -- DCK-01
- [x] L418 DCK-02 opt-in, per-gesture suppress -- DCK-02
- [x] L419 DCK-03 preview then atomic commit -- DCK-03
- [x] L420 DCK-04 keep connection when moved apart -- DCK-04
- [x] L421 DCK-05 zero-length connections addressable -- DCK-05
- [x] L427 JNC-01 crossing vs meeting point -- JNC-01
- [x] L428 JNC-02 drop onto route requests branch plan -- JNC-02
- [x] L429 JNC-03 atomic junction transaction -- JNC-03
- [x] L430 JNC-04 junction via normal extension points -- JNC-04
- [x] L431 JNC-05 explicit junction removal -- JNC-05
- [x] L432 JNC-06 per-member branching -- JNC-06

## 9. Groups, replacement, and clipboard

- [x] L438 GRP-01 flat groups -- GRP-01
- [x] L439 GRP-02 membership independent of overlap -- GRP-02
- [x] L440 GRP-03 collapse with proxy endpoints -- GRP-03
- [x] L441 GRP-04 hierarchy MAY, reject cycles -- GRP-04
- [x] L442 EDT-01 replace node with mapping, MUST -- EDT-01 (downgraded to SHOULD, config.yaml l.49)
- [x] L443 EDT-02 atomic delete, locked rejection -- EDT-02
- [x] L444 EDT-03 duplicate / fragment copy-paste -- EDT-03, EDT-03a
- [x] L445 EDT-04 external refs explicit on paste -- EDT-04
- [x] L446 EDT-05 validated paste, clipboard fallback -- EDT-05

## 10. React integration and renderer boundaries

- [x] L454 REA-01 mount component, provider, hooks -- REA-01
- [x] L455 REA-02 React peer dependency -- REA-02
- [x] L456 REA-03 React node content, bounded measurement -- REA-03, NOD-06
- [x] L457 REA-04 no per-pointer-sample state, granularity -- REA-04
- [x] L458 REA-05 Strict Mode, remount -- REA-05
- [x] L459 REA-06 SSR import safety -- REA-06
- [x] L460 REA-07 focus stability, announce on disappear -- REA-07
- [x] L464 Two profiles Symbol / React-content publish limits -- REN-06
- [x] L471 Switching profile keeps identities, policies, history -- REN-06 (serialization via snapshot contract)
- [ ] L473 Arbitrary React not auto-rasterized/GPU-ported -- no statement; fits REN-06 / REN-05 note
- [~] L469 React-content profile smaller workload; culling, measurement priority -- REN-06 has profile limits; no React-content workload or budget
      (no F-REACT)
- [x] L477 REN-01 independent extension contracts -- REN-01, NOD-08
- [x] L478 REN-02 no DOM/Canvas objects in model -- REN-02
- [x] L479 REN-03 shared viewport, pointer/focus ownership -- REN-03, OVL-01
- [x] L480 REN-04 dirty/invalidation notifications -- REN-04
- [x] L481 REN-05 PNG/SVG export SHOULD -- REN-05
- [~] L483 Canvas2D/WebGL/SVG choice is an architecture decision -- LAY-01 fixes Canvas2D; no recorded "validate against contracts" note

## 11. Transactions, validation, history, and synchronization

- [x] L491 Fig 11.1 lifecycle: preview, plan+opId+rev, atomic apply, reconcile -- PAT-01, PAT-02, TXN-01, TXN-02
- [x] L504 Local sync acceptance, external async; same tools both -- ADP-02, ADP-04, TXN-02
- [x] L506 No transport/cache/DB technology assumed -- MOD-02, ADP-01, ADP-05, ADP-06
- [x] L510 TXN-01 opId, base revision, atomic, changed IDs -- TXN-01, PAT-02
- [x] L511 TXN-02 five edit states, pending not authoritative -- TXN-02
- [x] L512 TXN-03 correlation, revision ordering, not lexical -- TXN-03, MOD-06
- [x] L513 TXN-04 no blind retry -- TXN-04
- [x] L514 TXN-05 cached vs commit validation, async identity -- TXN-05, CON-05
- [x] L515 TXN-06 responsiveness, serialize/reject conflicts -- TXN-06
- [x] L516 TXN-07 local undo/redo groups, exact restore -- TXN-07, PAT-03
- [x] L517 TXN-08 host-owned history, no hidden stack -- TXN-08, PAT-08
- [x] L518 TXN-09 external changes not undo entries -- TXN-09
- [x] L519 TXN-10 typed events, no half-applied view, reentrancy -- TXN-10, TXN-10a
- [x] L521-523 Cancel gesture discards only unsubmitted preview -- ADP-07, INT-05

## 12. Serialization, import, and application data

- [x] L529 SER-01 versioned JSON document -- SER-01, SNP-01
- [x] L530 SER-02 payload codecs -- SER-02
- [x] L531 SER-03 excluded content -- SER-03
- [x] L532 SER-04 validate whole import first -- SER-04, SNP-02
- [x] L533 SER-05 unknown types as placeholders -- SER-05, NOD-07
- [x] L534 SER-06 deterministic round trip, host formats -- SER-06
- [x] L535 SER-07 migration hooks SHOULD -- SER-07
- [x] L537-539 Asset refs explicit, no server contact on open -- SER-08, AST-01

## 13. Accessibility, diagnostics, trust, and lifecycle

- [x] L547 UX-01 keyboard focus/select/move/delete/undo/context -- UX-01
- [-] L547 UX-01 keyboard-accessible connection endpoint chooser -- UX-01 "not required"; config.yaml l.47-48
- [x] L548 UX-02 visible focus, no trap, not color-only -- UX-02
- [~] L548 UX-02 accessible DOM forms, menus, tooltips -- UX-02 covers shipped overlay editors/dialogs only; library ships no menu; tooltips not
      addressed
- [x] L549 UX-03 localizable, Unicode/IME layout -- UX-03
- [x] L550 UX-04 structured diagnostics -- UX-04, MOD-09
- [x] L551 UX-05 reduced motion -- UX-05
- [x] L552 UX-06 explicit data editing via commands -- UX-06
- [-] L554 Screen-reader explorer deferred -- UX-02 "non-goal"; config.yaml l.47-48
- [ ] L555-556 Document shipped a11y coverage and remaining barriers -- not required anywhere; fits packaging PKG-06 or interaction UX-02
- [x] L562 SAFE-01 untrusted import, no active SVG/HTML -- SAFE-01, AST-04
- [x] L563 SAFE-02 trusted renderer registrations -- SAFE-02
- [x] L564 SAFE-03 limits, bounded error state -- SAFE-03
- [x] L565 LIFE-01 disposal, idempotent -- LIFE-01
- [x] L566 LIFE-02 suspend hidden, resume -- LIFE-02
- [x] L567 LIFE-03 missing fonts/workers/context loss -- LIFE-03
- [x] L569-572 Callbacks cannot be sandboxed -- SAFE-04

## 14. Packaging, platform, and public API

- [x] L578 PKG-01 ESM, d.ts, entries, no TS build -- PKG-01
- [x] L579 PKG-02 no server/store/WASM/network -- PKG-02
- [x] L580 PKG-03 core in Node -- PKG-03
- [x] L581 PKG-04 five examples -- PKG-04
- [x] L582 PKG-05 no global CSS/fonts/singletons -- PKG-05
- [x] L583 PKG-06 support matrix, licence, bundle, versioning -- PKG-06
- [x] L584 PKG-07 configurable workers/CSP/webviews -- PKG-07
- [x] L585 PKG-08 tree-shaking, default preset -- PKG-08
- [x] L587-589 Baseline: Chromium/Firefox/Safari, React 19, ES2022, Node 22 -- PKG-06; config.yaml support matrix
- [~] L590-591 Touch/pen must not corrupt state; no multitouch/pinch in R1 -- touch long-press (INT-11c) only; no touch-safety or pinch non-goal
      stated

## 15. Performance and capacity acceptance

- [x] L602-609 F-SMALL, F-TYPICAL, F-LARGE, F-LIVE fixtures -- PERF-01
- [x] L606 F-ALL all-visible low-detail fixture -- PERF-02e (target loosened)
- [-] L607 F-REACT fixture -- config.yaml l.49-51 benchmark suite = 4 fixtures
- [-] L608 F-DENSE stress/correctness fixture -- config.yaml l.49-51; PERF-05 only says report dense cases
- [x] L613-614 Reference display 60 Hz, 1440x900, DPR 1 and 2 -- PERF-02
- [x] L618 Frame p95 16.7 / p99 33.3 ms -- PERF-02 (F-REACT dropped)
- [x] L619 Pointer-to-preview p95 33 ms -- PERF-02
- [x] L620 Picking p95 2 ms -- PERF-02a
- [x] L621 Local patch p95 4 ms -- PERF-02a
- [ ] L622 Obstacle refinement 20 routes p95 100 ms, input responsive -- not in PERF; ROU-10 covers async routing without number; fits performance
      PERF-02a
- [~] L623 F-LARGE projection/index <= 1 s, report first frame separately -- PERF-02a has 1 s; separate asset/first-usable-frame reporting missing
- [-] L624 F-ALL p95 <= 50 ms -- PERF-02e sets 33.3 ms as labeled, non-failing target
- [x] L625 F-LIVE navigation, report coalesced updates -- PERF-02b
- [x] L626 Bundle 75 / 150 KiB gzip -- PERF-02c
- [x] L627 Idle: no self-sustaining loop -- PERF-02d
- [~] L628 Lifecycle: 30 mount cycles, no heap growth -- PERF-02d checks retained views; no heap-growth check
- [-] L630-632 F-REACT gate concerns defined controls; focused node counts -- follows F-REACT removal
- [~] L638 PERF-01 raw samples, reference-machine provenance -- PERF-01 has p50/95/99, seeds, scripts; raw samples and machine provenance not
      required
- [~] L639 PERF-02 meet gates on approved reference machine; targets until measured -- PERF-02 "labeled targets"; no approved reference machine
      concept
- [x] L640 PERF-03 bounded dirty-driven work -- PERF-03
- [x] L641 PERF-04 index + cull, off-screen endpoints -- PERF-04, IDX-01..03
- [x] L642 PERF-05 bounded caches, report worst cases -- PERF-05, AST-03
- [x] L643 PERF-06 low-detail keeps junctions/selection/errors -- PERF-06, LAY-04
- [x] L644 PERF-07 baseline editor comparison -- PERF-07 (React Flow)
- [ ] L646-647 Measure >= 30 s after warm-up, repeat 3 times -- PERF-01 scenarios use 30 s only; no warm-up/repeat rule; fits performance PERF-01
- [ ] L647-648 Include allocation/long-task traces, route work counts -- fits performance PERF-01
- [ ] L648-649 Do not pool percentiles across machines/browsers/DPR -- fits performance PERF-01 (per-browser/DPR reporting is implied only)
- [-] L649-651 Idle/memory recorded separately; memory ceiling after first run -- config.yaml l.49-51 trims heavy performance process; no memory
      ceiling in specs

## 16. Detailed use cases (UC-01..UC-19)

- [x] UC-01 Embed a local editor -- NOD-01/02/03/08/09, INT-01, TXN-07, SER-01, MOD-10, PKG-02, REA-01, NOD-07
- [~] UC-02 Place, move, transform, dock -- DCK-01..05, INT-02/03/08/10, NOD-04, GEO-02a, VIS-04; missing: palette-item drag as an explicit gesture;
      guides are SHOULD
- [~] UC-03 Connect simple ports -- CON-01..05, INT-04/12, PRT-03..06, GEO-05; missing: keyboard chooser trimmed; port occupancy in candidate
      highlight
- [x] UC-04 Composite socket -- SIG-00..08, CON-04/06, INT-12, JNC-06, TXN-05
- [x] UC-05 Routed connection -- ROU-01..12, CON-08, INT-04/05/09; missing: segment move/split still in change add-route-editing, not in main spec
- [~] UC-06 Reconnect / disconnect -- CON-07, SIG-06, DCK-04, INT-04/05, MOD-05; missing: undo of reconnect restoring route constraints; whole-
      assembly reconnect
- [x] UC-07 Dynamic port list -- PRT-01/02/07, MOD-03, SIG-01, REF-06
- [x] UC-08 Junction -- JNC-01..06, PRT-02, ROU-11, MOD-05
- [x] UC-09 Replace, delete, duplicate, paste -- EDT-01..06, SIG-06, JNC-05, TXN-07, SER-02
- [~] UC-10 React content and provided value -- REF-01..06, REA-01/03/07, NOD-05/06, INT-06, UX-02/03/06; missing: source-picker hook not specified
      (no shipped picker)
- [~] UC-11 Read-only and permissions -- MOD-11, CON-01/07, DCK-02, EDT-02, INT-03/07/11, UX-01/02; missing: permission change mid-gesture; keyboard
      connection path trimmed
- [x] UC-12 Organize visually -- GRP-01..04, VIS-04
- [~] UC-13 External authoritative model -- MOD-02/06/13, TXN-01..10, CON-05, DCK-03, INT-08, ROU-10; missing: permission change during pending
      edit; status-recovery query
- [x] UC-14 Save, load, recover -- SER-01..07, SAFE-01/02, NOD-07, REN-05, EDT-04/05, GRP-04, ROU-03
- [x] UC-15 Share a model across views -- MOD-10, VIS-01, REN-04, GEO-03, TXN-09, PKG-05, LIFE-01; missing: alias presentation dropped (MOD-12)
- [~] UC-16 Cancellation, failures, lifecycle -- INT-05/09, LIFE-01..03, SAFE-01/03, REA-05/06, PKG-06/07, TXN-03/04; missing: per-tool interrupt-
      source matrix not required
- [~] UC-17 Large graph -- PERF-01..07, LAY-05, VIS-03, GEO-04, ROU-05/07/08/10, UX-05; missing: F-REACT/F-DENSE dropped; no reference hardware or
      memory ceiling
- [x] UC-18 Customize independently -- REN-01/03, NOD-02/04/08, ROU-02/09, GEO-01..06, VIS-01..03, CON-08, DCK-05
- [x] UC-19 Headless and typed commands -- MOD-01/08/13, PKG-01/03/04, INT-07, TXN-07/10/10a, CON-03, SIG-08, NOD-09

## 17. Verification strategy and traceability

- [x] Each requirement references at least one use case -- config.yaml rules.specs; every spec cites UC IDs
- [x] Requirement IDs linked to tests -- AGENTS.md and config.yaml rules.tasks (tests name IDs)
- [~] Completing a use case does not waive unexercised clauses -- practice only (per-MUST evidence rule); not written down
- [~] Verification layer table (headless, property, React, real browser, failure injection, visual, perf, packaging) -- practice only (vitest
      projects, PERF-01, PKG-*)
- [~] 17.1 extension acceptance checklist (8 demonstrations) -- partly via NOD-08, REN-01, PKG-04 examples; not recorded as a list

## 18. R1 completion and implementation sequencing

- [~] Slice table A-E with use-case exit evidence -- slices named in AGENTS.md only; no slice-to-UC mapping in specs
- [x] Prototype work must not silently redefine MUST scope -- AGENTS.md ("don't silently change a requirement")
- [x] R1 criterion 1: every MUST has linked evidence -- AGENTS.md, config.yaml rules.tasks
- [~] R1 criterion 2: all use-case success and failure paths covered -- not recorded as a gate
- [x] R1 criterion 3: local and external ownership both work -- MOD-02, ADP-01, ADP-02
- [x] R1 criterion 4: both rendering profiles publish measured limits -- REN-06, PERF-*
- [~] R1 criterion 5: open decisions resolved, omitted SHOULDs listed -- SHOULD tagging exists; no list of omitted SHOULDs
- [~] R1 criterion 6: examples, typed API docs, format docs, migration ship -- PKG-04, PKG-06, SER-07, docs/format.md; API docs not required
- [-] Trimmed scope (aliases, keyboard chooser, replace-node SHOULD, heavy perf process) -- recorded in config.yaml, diverges from slice text

## 19. Explicit decisions still open

- [x] Package name and licence -- config.yaml context, PKG-01 (publication of notices is PKG-06, not yet done)
- [~] Exact public API shape -- direction settled (typed adapter/commands/policies); no freeze while pre-release
- [x] Default renderer and router -- config.yaml: Canvas2D, in-house spatial index, orthogonal router (ROU-05)
- [~] Reference hardware and memory ceiling -- machine record in baseline JSON only; no named configuration or ceiling in performance
- [x] Browser, React and runtime support -- config.yaml support matrix, PKG-06
- [~] Default junction materialization -- open: JNC-02 leaves it to the host; no preset decision recorded
- [x] Optional group collapse and export scope -- config.yaml: GRP-03 SHOULD, GRP-04 MAY, REN-05 SHOULD, not a gate

## Research notes (docs/archive/research-notes.md)

- [-] L40 "A11y / screen-reader parity is out of scope" -- cfg "no screen-reader parity"; UX-01, UX-02 keep keyboard + focus only
- [x] L43 "optimize for AI-legibility: small files, narrow interfaces" -- cfg Code conventions; AGENTS.md
- [-] L46 "WASM-compiling the existing Qt nodeeditor ... rejected" -- PKG-02 "mandatory WASM" excluded
- [x] L82 "Model is the source of truth; view is a projection" -- MOD-01, ADP-01, MOD-10, cfg Model placement
- [x] L84 "boundingRect + shape() two-phase hit-testing" -- GEO-04, GEO-04a, IDX-01
- [x] L85 "Paint is a pure function of (state, style, options)" -- REN-01, VIS-01, REN-02
- [x] L86 "Geometry, style, and painter are three orthogonal axes" -- REN-01, NOD-08, cfg Node appearance
- [x] L90 "drop signals/slots; QVariant dynamic properties" -- AGENTS.md rejects roles; TXN-10 typed events
- [~] L343 "Model exposes typed selectors / observable slices" -- MOD-05, MOD-07, REA-04 cover change notification and subscription granularity; no
      spec for core selector-subscribe API
- [x] L157 "Engine-as-separate-layer ... enforced by directory boundary" -- PKG-03, architecture.test.ts, cfg layers
- [-] L164 "Pluggable per-node evaluators ... runtime + symbolic" -- Library has no evaluation engine; NOD-01 registers types only (app-neutral
      scope)
- [~] L172 "Web Worker offload with a clean shim" -- Only optional router workers: ROU-10, PKG-07, LIFE-03; no model/engine worker
- [x] L178 "Incremental dirty propagation ... coalesces patches" -- LAY-02, REN-04, PERF-03, ROU-08
- [x] L184 "Transactions as discriminated unions ... log, replay, undo" -- PAT-01, PAT-04, TXN-01
- [x] L190 "Strict UI-vs-graph store split" -- MOD-04 (ephemeral interaction state separate), PAT/pending layer TXN-02
- [x] L196 "Wire protocol with schema-driven serialization" -- SNP-01/02, SER-01/02 (versioned, codecs, validator); schema-table-to-encoder
      generation not adopted
- [x] L202 "Schema-driven node definitions ... single source of truth" -- NOD-01, NOD-03, SIG-01
- [x] L208 "Multiple model instances keyed by id" -- MOD-10, LIFE-01 per-instance state
- [x] L218 "Define our own Edge/Node types, not React Flow's" -- PKG-03, REN-02, MOD-01
- [x] L220 "Oversized central store file: decompose" -- cfg Code conventions (100-300 lines)
- [x] L227 "Singletons ... won't work in test harnesses or SSR" -- PKG-05, REA-06, cfg "No module-level singletons"
- [x] L232 "any in hot paths ... stricter typing" -- cfg "no any in public or hot paths"
- [x] L237 "No interaction state machine ... must be explicit FSM" -- INT-05a, cfg "hand-rolled, no XState"
- [~] L244 "Sibling counting ... O(E) per edge per re-render" -- PERF-03/04, IDX-02 forbid per-event scans; sibling/parallel-edge offset indexing
      not stated (GEO/ROU parallel hit only)
- [-] L248 "No spatial index ... add rbush (R-tree)" -- Spatial index in-house, no rbush: cfg; IDX-01..04
- [x] L251 "setInterval ticker ... use requestAnimationFrame by dirty flags" -- LAY-02, PERF-02d no self-sustaining loop
- [x] L306 "Engine zero imports from view; enforce from day one" -- PKG-03, architecture.test.ts
- [~] L309 "Renderer pure fn; swap Canvas2D <-> Pixi" -- REN-02 keeps renderer objects behind boundary; renderer swappability (Pixi/WebGPU) not
      required, cfg fixes Canvas2D
- [x] L318 "Renderer choice: PixiJS vs Canvas2D vs WebGPU; 10k-node stress prototype" -- cfg Rendering: Canvas2D; PERF-01 F-LARGE benchmark
- [-] L320 "Host-language registry meets TS node registry; generated bindings?" -- Host-specific; out of library scope (neutrality rule in cfg);
      SER-02 payload codecs, NOD-01
- [x] L322 "Wire routing: orthogonal vs bezier vs magnetic" -- ROU-01, ROU-02
- [x] L324 "sub-graphs / hierarchical components in v1?" -- GRP-01 flat, GRP-03 SHOULD, GRP-04 MAY (cfg)
- [-] L388 "UndoCommand -> snapshot + Immer + transaction log" -- Patch-based inverse history chosen: PAT-03, TXN-07, cfg Edits; TXN-08 host-owned
      history
- [x] L399 "Style POJO (theme tokens, hover, selection, LOD) as last arg" -- VIS-01, LAY-04, PRT-06
- [x] L406 "spatial index over node AABBs ... edges own index on path bounds" -- IDX-01, IDX-03, GEO-04
- [x] L421 "Each axis separately registrable: node/edge/port renderers, geometry, routers, hit testers" -- REN-01, NOD-08, PRT-05, ROU-02
- [x] L494 "routing, rendering, hit-testing for an edge are three slots" -- ROU-02 (path painter/picker), ROU-09, CON-08
- [x] L472 "RouteContext: obstacle bounds, grid, layout hints" -- ROU-03, ROU-04, ROU-05
- [~] L503 "Custom connection styles: double-line connection, arrows, dashed, dotted, halo" -- ROU-09 covers labels, arrowheads, dashes, lanes,
      diagnostic decorations; per-kind style registry/examples not specified
- [ ] L507 "End-marker tick: perpendicular tick at the input end" -- No requirement for end-marker decorations beyond arrowheads (domain-specific;
      may be intentionally app-level via ROU-02)
- [ ] L512 "Transient overlay: temporary overlay edge" -- No transient overlay-edge (non-model) drawing hook; presence hook OVL-02 is
      cursors/selections only
- [~] L505, 509 "Animated flow direction / glow when carrying live data" -- UX-05 reduced motion; PERF-02b live update budget; no animated-
      decoration contract
- [x] L511 "Multi-bond / vector: bundled curve with slash-tick + cardinality label" -- SIG-07, geometry bundle lanes, GEO-04a, ROU-09
- [x] L513 "Error / overconstrained: red strikethrough with diagnostic glyph" -- UX-04, LAY-04 (error indicators kept), ROU-09 diagnostic decorations
- [x] L452 "Stacked split-port at one location" -- SIG-00..07, PRT-05, PRT-03
- [x] L527 "Capsule / multi-handle fan-in/out as first-class port kind" -- PRT-04 attachment limits, JNC-01..06
- [x] L529 "Vector triplet port (future)" -- SIG-00..07 composite signatures
- [x] L534 "Composition rule: cull then body, ports, edges via cached path" -- LAY-03, IDX-03, ROU-08
- [x] L551 "Plugin ships component and renderers as separate registry entries" -- NOD-08, SAFE-02 trusted renderer registrations; boundary
      correction (557) via SAFE-04
- [x] L584 "Library keeps own read model; external adapter; pending layer rollback" -- ADP-01, MOD-02, TXN-02, ADP-03
- [x] L593 "Revision numbers returned with every accepted command" -- ADP-06, MOD-06
- [x] L595 "Change events carry actual changes (changes@revision)" -- ADP-06, cfg Model placement
- [x] L598 "Commands accept operation ID and base revision; structured accept/reject" -- TXN-01, TXN-03, PAT-02
- [x] L581, pitfall "Failures only logged; rejected edit stays visible" -- TXN-02 rollback, TXN-05, TXN-04
- [x] L281 "DOM overlay for selected-node inline editors" -- OVL-01, UX-06
- [x] L279 "Viewport: pan/zoom/transform" -- INT-01, GEO-01, GEO-02
- [x] L74 "Undo: host must delegate history, no second frontend undo stack" -- TXN-08, TXN-09

## Gaps

Every `[~]` and `[ ]` item with a suggested home spec. Items already marked `[-]` are not gaps.

- [1] L75-77 changes to MUST scope need explicit revision -> process rule only; optional note in packaging
- [1] L93-100 non-goals (workflow execution, value propagation, scheduling, units, nested subgraphs, marketplace, mobile-first) -> safety-lifecycle
      or packaging: add a Non-goals requirement
- [3] L117 typed contracts instead of property lookups -> packaging or canvas-view REN-01
- [3] L151 hiding a path never deletes a connection -> routing ROU-12 or canvas-view LAY-04
- [3] L156 render and pick are side-effect free on model data -> canvas-view REN-02
- [4] L174 snapshot, descriptor and subscription-value lifetime -> graph-model MOD-13
- [4] L174 external adapters announce changes, never mutate silently -> model-adapters ADP-06 or graph-model MOD-13
- [5/6] L275-277 undirected ports need an opt-in policy -> connection-policy CON-01b: record the decision
- [6] L332 equal labels never imply matching keys -> composite-signatures SIG-01 or SIG-08
- [10] L473 arbitrary React content is not auto-rasterized or GPU-ported -> canvas-view REN-06
- [10] L469 React-content profile workload and budgets -> canvas-view REN-06 (benchmark deliberately dropped)
- [10] L483 Canvas2D versus other renderers as a validated decision -> canvas-view LAY-01 or config.yaml
- [13] L548 accessible tooltips and menus -> interaction UX-02
- [13] L555 document shipped accessibility coverage and remaining barriers -> packaging PKG-06 or interaction UX-02
- [14] L590 touch/pen safety, no pinch or multitouch in R1 -> interaction INT-05 or packaging PKG-06
- [15] L622 obstacle refinement p95 100 ms for 20 routes -> performance PERF-02a
- [15] L623 first usable frame and asset load reported separately -> performance PERF-02a
- [15] L628 heap-growth check across 30 mount cycles -> performance PERF-02d
- [15] L638 raw samples and reference-machine provenance -> performance PERF-01
- [15] L639 approved reference machine gates claims -> performance PERF-02
- [15] L646-649 warm-up, three repeats, traces, route work counts, no pooled percentiles -> performance PERF-01
- [16] UC-02 palette-item drag as an explicit gesture with ghost and guides -> interaction (palette drag) or docking DCK-01
- [16] UC-03 candidate highlight shows port occupancy -> ports PRT-06 or interaction INT-04
- [16] UC-03/UC-11 keyboard connection chooser (trimmed on purpose) -> interaction UX-01 if reinstated; note trim in connection-policy
- [16] UC-05 segment move and split not yet in main routing spec -> merge change add-route-editing into routing
- [16] UC-06 undo of reconnect restores route constraints; whole-assembly reconnect -> connection-policy CON-07 or routing ROU-03
- [16] UC-10 source-picker hook for provided values -> provided-values REF-05
- [16] UC-11/UC-13 permission change mid-gesture or pending edit -> connection-policy CON-05 or graph-model MOD-11
- [16] UC-13 status-recovery query for unknown-outcome edits -> model-adapters or patches-and-history TXN-04
- [16] UC-16 interrupt-source matrix for every editing tool -> interaction INT-05 or safety-lifecycle LIFE-02
- [16] UC-17 reference hardware, memory ceiling, dense-fixture claims -> performance PERF-01/02
- [17] verification layers, extension acceptance list, use-case completion rule -> config.yaml rules.tasks or packaging
- [18] slice-to-UC exit mapping, R1 completion gates, list of omitted SHOULDs -> config.yaml context or a roadmap doc under docs/
- [19] exact API freeze; reference hardware; default junction materialization -> packaging; performance; junctions JNC-02
- [R] L343 core selector/slice subscription API -> graph-model MOD-05
- [R] L172 worker offload of more than the router -> routing ROU-10: record as router-only
- [R] L244 parallel-edge offsets from an incremental index -> performance PERF-04 or routing ROU-08
- [R] L309 renderer swappability beyond Canvas2D -> config.yaml decision note; REN-02 keeps the door open
- [R] L503 per-kind connection styles sharing one router -> routing ROU-09: add a two-kind scenario
- [R] L507 end-marker decorations at either endpoint -> routing ROU-09 or record as host-level via ROU-02
- [R] L512 transient overlay connection that is not in the model -> canvas-view OVL-02 or routing
- [R] L505-509 animated flow decoration -> interaction UX-05 with PERF-03 frame budget
- [R] L554 screen-reader explorer deferred (UX-02 non-goal) -> kept dropped; no action
