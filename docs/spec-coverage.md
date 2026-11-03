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

- [x] L48-52 "without implementing its own viewport, selection system, connection gestures, or undo" -- Viewport navigation; Selection; Connection gestures; Local undo and redo; Tree-shakable features and default preset
- [x] L54-59 Two equally supported modes: local document and external model -- Local adapter; External authority without duplicate storage
- [x] L61-63 "React is a supported integration surface, not a requirement" -- React is a peer dependency; Headless core in Node
- [x] L62-63 Canvas symbols and React content have separate performance envelopes -- Rendering profiles; Interaction budgets; Interactive React node content
- [x] L67-73 MUST/SHOULD/MAY language, R1 meaning, stable IDs -- openspec/config.yaml rules.specs (ID prefix, "(SHOULD)" suffix, UC refs); MAY
      handled per-requirement
- [~] L75-77 "Changes to MUST scope require an explicit revision" -- Only a process rule in AGENTS.md ("don't silently change a requirement"); not a
      spec requirement
- [~] L93-96 Library does not execute workflow, propagate values, schedule, interpret units, run imported code -- Untrusted imported content; Trusted renderer registrations only; Explicit application-data editing, provided-
      values Purpose cover code/values; no consolidated non-goals (workflow execution, scheduling, units, auth, backend)
- [x] L95 "resolve multi-author conflicts"  excluded -- Server-authoritative collaboration
- [x] L95-96 Trusted renderers/codecs/policy callbacks run as host code -- Trusted extension boundary documented; Trusted renderer registrations only
- [ ] L98-100 Nested subgraph navigation, capability negotiation, graph execution, marketplace, mobile-first not R1 -- No non-goals list in specs
- [-] L99-100 Complete screen-reader representation of large graphs not R1 -- config.yaml "accessibility reduced to keyboard shortcuts"; Keyboard editing shortcuts; Usable shipped controls
- [x] L100-101 Flat groups, dynamic ports, keyboard editing, accessible DOM controls in scope -- Flat visual groups; Atomic dynamic port changes; Keyboard editing shortcuts; Usable shipped controls
- [x] L101-102 Automatic layout integration separate from routing -- Alignment and snap guides (external layout proposes batch of positions), Routing requirements

## 2. Design principles

- [x] L108 Application-independent meaning; host defines payloads/semantics -- Replaceable connection policy; Explicit application-data editing, config.yaml neutrality
- [x] L109 Model/view separation, multiple views on one model -- Headless in-memory model; Independent views of one model
- [x] L110 Useful defaults, replaceable policies -- Replaceable connection policy; Local adapter; Tree-shakable features and default preset
- [x] L111 Stable identity across port insert/reorder/rename/move -- Stable identities; Stable port addressing; Atomic dynamic port changes
- [x] L112 Independent extension contracts -- Independent extension contracts; Independent extension registrations
- [x] L113 Explicit reversible edits; failure leaves no partial change -- Atomic patch application; Inverse patches; One history entry per gesture; Failing type factories
- [x] L114 Capacity claims name profile, workload, hardware, evidence -- Repeatable benchmark suite; Interaction budgets
- [x] L115 Rendering displays, commands request, adapter owns state -- Library read model; Commands are planners; Host-owned history
- [~] L117 "typed contracts rather than unstructured property lookups" -- Only in AGENTS.md/config code conventions; no spec requirement
- [x] L117-119 Customization must not require rewriting viewport or built-in tools -- Independent extension contracts; Tree-shakable features and default preset
- [x] L121-122 Not restricted to input-left/output-right rectangular nodes -- Independent port properties; Custom shapes and portless nodes; Sizes and port layouts

## 3. Shared vocabulary and invariants

- [x] L128-145 Vocabulary: Host, Graph model, View document, Scene, Node, Port, Member -- Separated state categories (durable view data), Library read model; Opaque and mapped members; Port requirements
- [x] L136-138 Provided value, Connection plan, Assembly -- Provided value identity and ownership; Structured policy outcomes; Atomic assemblies
- [x] L139-141 Route (derived vertices vs persistent constraints), Junction, Group -- Persistent route constraints; Junction requirements; Flat visual groups
- [x] L142 Gesture definition (commit or cancellation) -- Gesture lifecycle and cancellation
- [x] L143 "Revision: not necessarily a number" -- Revisioned synchronization mode (ordering declared by adapter, not token text)
- [x] L144 Capability separate from selection or visibility -- Capabilities and read-only mode
- [x] L148 IDs are not labels, offsets, screen positions -- Stable identities
- [x] L149 Direction is not geometry -- Independent port properties
- [x] L150 Connection existence independent of route length/overlap -- Connection identity independent of presentation; Route-only edits keep topology
- [x] L151 "A crossing is not a junction" -- Crossing versus meeting point
- [~] L151 "hiding a path does not delete a connection" -- Route-only edits keep topology; Level of detail (low detail keeps attachments) imply it; no explicit statement
- [x] L152-153 One cable can carry multiple bindings, each inspectable -- Collapsed and expanded presentation
- [x] L154 Reading provided value creates no ordinary edge -- Reference bindings distinct from connections
- [x] L155 Same model in two views does not duplicate connections -- Independent views of one model
- [~] L156 Rendering and picking do not mutate data or run app logic -- Renderer objects stay behind the boundary; Explicit application-data editing cover renderer objects and explicit commands; no explicit
      "render/pick are side-effect free" rule

## 4. Graph model and state ownership

- [x] L162 headless in-memory model -- Headless in-memory model
- [x] L163 external adapter -- External authority without duplicate storage
- [x] L164 stable IDs, deleted IDs not reused, undo restores same -- Stable identities; Identifier generation
- [x] L165 payload/view/ephemeral/cache separation -- Separated state categories
- [x] L166 atomic change, consistent notification -- Consistent change notification
- [x] L167 reset and incremental with revision continuity -- Revision continuity; Revisioned synchronization mode
- [x] L168 indexed queries -- Indexed queries
- [x] L169 deterministic ordering -- Deterministic ordering
- [x] L170 structured errors, reject before change -- Structured structural errors
- [x] L171 independent views, history in adapter -- Independent views of one model
- [x] L172 read-only and capabilities -- Capabilities and read-only mode
- [-] L173 aliases (SHOULD) -- config.yaml "aliases dropped"
- [x] L174 immutable snapshots -- Immutable read snapshots
- [~] L174 declare ownership/lifetime of snapshots, descriptors, subscription values -- Immutable read snapshots has only a snapshot-lifetime scenario;
      descriptors/subscription values not covered
- [ ] L174 "external adapters must announce changes rather than silently mutating" -- Nothing in model-adapters; add to Revisioned synchronization mode; Immutable read snapshots
- [x] L176-177 Local model is a convenience adapter, not a base class -- External authority without duplicate storage; Local adapter, AGENTS.md
- [x] L177-179 Concrete typed queries; host need not expose full object tree -- External authority without duplicate storage; Snapshot synchronization mode
- [x] L181-186 Structural integrity vs application validity; no silent retarget/drop -- Structural integrity versus application validity
- [x] L186 Existing invalid-but-safe state diagnosed, not rewritten -- Structural integrity versus application validity; Unknown types preserved
- [x] L194-197 Library always keeps read model; authority via adapter -- Library read model; Local adapter
- [x] L201 Pending layer separate from confirmed state -- Pending layer and edit states
- [x] L202 "submit(plan, opId, baseRevision) returns a result or a promise" -- Tagged edits with structured results; Revisioned synchronization mode
- [x] L203 Inbound reset or changes@revision; gap triggers resync -- Revisioned synchronization mode; Revision continuity
- [x] L204 History in adapter: local stack or host-owned -- Local undo and redo; Host-owned history
- [x] L218-226 Rationale: no remote-only without read model; no library-only authority -- Library read model; External authority without duplicate storage
- [x] L227-228 Tools written once against adapter contract, sync or delayed -- Local adapter

## 5. Node, port, and appearance requirements

- [x] L236 type registration -- Type registration
- [x] L237 custom shapes, portless nodes -- Custom shapes and portless nodes
- [x] L238 sizes and layouts -- Sizes and port layouts
- [x] L239 rotation, mirroring, resize, shared transform -- Node transforms; Capability-gated resizing; Shared node transform
- [x] L240 independent labels/status -- Independent labels and decorations
- [x] L241 React content, form input not graph commands -- Interactive React node content; React content inside nodes
- [x] L242 unknown-type/missing-asset placeholders -- Unknown types and missing assets; Unknown types preserved; Asset failure states
- [x] L243 independent registrations -- Independent extension registrations
- [x] L244 creatable types, create at position, failing factories -- Creatable types and create-at-position; Failing type factories
- [x] L248 stable port/member addressing -- Stable port addressing
- [x] L249 atomic dynamic ports -- Atomic dynamic port changes
- [x] L250 independent direction/cardinality/side -- Independent port properties
- [x] L251 attachment limits -- Attachment limits
- [x] L252 glyph/target/label/anchor separate -- Separate glyph, target, label, and anchor
- [x] L253 distinct target states -- Distinct target states
- [x] L254 preview removal effects -- Preview effects of port removal or type change
- [x] L260 theme tokens and overrides -- Theme tokens and overrides
- [x] L261 z-order and interactive order -- Z-order and interactive order
- [x] L262 body/painted/hit bounds -- Body, painted, and hit bounds
- [x] L263 alignment, spacing, snap guides (SHOULD) -- Alignment and snap guides

## 6. Connections and extensible port signatures

- [x] L269-273 Default policy: output-to-input, equal types, one per input, no self-loop/duplicate, cycles ok -- Default directed preset
- [~] L275-277 "Undirected ports require an enabled host/type policy" -- Default undirected preset makes undirected accepted by default; opt-in gate dropped. Needs a
      decision or explicit note in connection-policy
- [x] L277-278 Directed and undirected coexist in one graph -- Default undirected preset
- [x] L281 documented default, replaceable -- Replaceable connection policy
- [x] L282 self-loops, parallel, cycles, undirected by policy -- Policy-controlled topology features
- [x] L283 one policy for all input routes -- One policy for all input routes
- [x] L284 four outcomes, not Boolean -- Structured policy outcomes
- [x] L285 revalidate at commit -- Commit-time revalidation
- [x] L286 no implicit conversions -- No implicit conversions
- [x] L287 old binding survives failed reconnect -- Existing binding survives failed reconnection
- [x] L288 identity independent of path/style/endpoint order -- Connection identity independent of presentation
- [x] L292-295 Composite port: many typed members, one socket; library does not interpret meaning -- Optional composite signatures, composite-signatures Purpose
- [x] L302-306 Required structural member vs provided value vs required value -- Optional composite signatures; Required values resolve to one provider
- [x] L308-310 Port may have single member, only values, or none -- Optional composite signatures
- [x] L314 stable schema/version ids and member keys -- Stable signature description
- [x] L315 opaque and mapped members -- Opaque and mapped members
- [x] L316 mandatory members mapped; full-match exact -- Mandatory members fully mapped
- [x] L317 required values one provider -- Required values resolve to one provider
- [x] L318 plan preview; ambiguity needs choice -- Composite plan preview; Connection-choice request
- [x] L319 atomic assembly; unpack explicit -- Atomic assemblies
- [x] L320 collapsed/expanded lanes -- Collapsed and expanded presentation
- [x] L321 signature separate from policy -- Signature separate from compatibility policy
- [x] L323-330 Strict composite policy formula -- Mandatory members fully mapped; Required values resolve to one provider; Replaceable connection policy
- [~] L332 "Different keys never match merely because labels are equal" -- Stable signature description (keys independent of label); no explicit rule that
      equality/mapping must be declared by schema/policy
- [x] L333-334 "Optional" never lets a missing required value get a default -- Required values resolve to one provider
- [x] L344 identity and ownership -- Provided value identity and ownership
- [x] L345 reference binding distinct -- Reference bindings distinct from connections
- [x] L346 many readers, one source; cost documented -- Many readers, one source per binding
- [x] L347 targets without visible ports -- Targets without visible ports
- [x] L348 host source scheme; unavailable/pending/stale -- Host-supplied source references
- [x] L349 ownership preserved -- Ownership preserved across presentation changes
- [x] L351-355 Displaying a value creates no executable binding; library does not inspect computation -- Reference bindings distinct from connections; Explicit application-data editing, provided-values Purpose

## 7. Geometry, paths, and routing

- [x] L362 named spaces -- Named coordinate spaces
- [x] L363 one transform convention, persist world values -- One transform convention; Shared node transform
- [x] L364 scroll/resize/zoom/DPI -- Correct under layout and display changes
- [x] L365 broad then precise phase -- Two-phase hit-testing
- [x] L366 CSS-pixel tolerances -- Screen-space tolerances
- [x] L367 finite ranges, degenerate inputs -- Finite ranges and degenerate inputs
- [x] L373 straight, bezier, orthogonal; separable -- Built-in route modes
- [x] L374 custom path contract, no SVG/Canvas-only types -- Custom path contract
- [x] L375 waypoints, segment move, persisted separately -- Persistent route constraints
- [x] L376 escape direction and clearance -- Port escape and clearance; Orthogonal route clear of its endpoint nodes
- [x] L377 obstacle-aware routing, unresolved marked -- Obstacle-aware orthogonal routing
- [x] L378 complete/provisional/unroutable -- Route outcomes
- [x] L379 locked constraints, stability, determinism -- Deterministic and stable routing
- [x] L380 bounded invalidation -- Bounded route invalidation
- [x] L381 labels/arrowheads/dashes/lanes/diagnostics -- Decorations without policy
- [x] L382 bounded async routing -- Bounded asynchronous routing
- [x] L383 snap/label/bridge styles (SHOULD) -- Segment snapping, label placement, and crossing styles (title lacks "(SHOULD)" suffix though text says not a gate)
- [x] L385-387 Path length/bends are presentation unless host makes a command; no implicit invocation -- Route-only edits keep topology
- [x] L389-390 Bundled path hit identifies assembly vs member -- Hit result identity and order
- [x] L390-391 Coincident/parallel paths need deterministic disambiguation (e.g. chooser) -- Hit result identity and order, geometry scenario on chooser ordering

## 8. Interaction, docking, and junctions

- [x] L399 pan, cursor zoom, fit, reset, focus -- Viewport navigation
- [x] L400 single/additive/toggle/marquee selection -- Selection
- [x] L401 group move, snap, suppression, locked -- Group movement with snapping
- [x] L402 drag-to-connect, click-to-route, right-click -- Connection gestures
- [x] L403 thresholds, capture, cancellation -- Gesture lifecycle and cancellation
- [x] L404 scoped shortcuts, IME, wheel -- Input scoping
- [x] L405 same commands for menus/shortcuts -- Unified commands
- [x] L406 one committed edit per gesture -- One committed edit per gesture; One history entry per gesture
- [x] L407 auto-pan SHOULD -- Auto-pan
- [x] L411 Docking: no merge of identities, no parent/child -- docking Purpose; Opt-in and suppressible docking
- [x] L417 candidate preview, ranking, hysteresis -- Docking candidate preview
- [x] L418 opt-in, per-gesture suppress -- Opt-in and suppressible docking
- [x] L419 preview then atomic commit -- Atomic dock commit
- [x] L420 keep connection when moved apart -- Undocking preserves connections
- [x] L421 zero-length connections addressable -- Zero-length connections stay addressable
- [x] L427 crossing vs meeting point -- Crossing versus meeting point
- [x] L428 drop onto route requests branch plan -- Drop on route requests a branch plan
- [x] L429 atomic junction transaction -- Atomic branching
- [x] L430 junction via normal extension points -- Junctions use normal extension points
- [x] L431 explicit junction removal -- Explicit junction removal
- [x] L432 per-member branching -- Per-member branching

## 9. Groups, replacement, and clipboard

- [x] L438 flat groups -- Flat visual groups
- [x] L439 membership independent of overlap -- Membership independent of overlap
- [x] L440 collapse with proxy endpoints -- Group collapse
- [x] L441 hierarchy MAY, reject cycles -- Hierarchical groups
- [x] L442 replace node with mapping, MUST -- Replace node with port mapping (downgraded to SHOULD, config.yaml l.49)
- [x] L443 atomic delete, locked rejection -- Atomic delete
- [x] L444 duplicate / fragment copy-paste -- Duplicate and paste fragments; Clipboard fragments use the graph snapshot shape
- [x] L445 external refs explicit on paste -- Explicit external-reference handling on paste
- [x] L446 validated paste, clipboard fallback -- Validated paste with fallback

## 10. React integration and renderer boundaries

- [x] L454 mount component, provider, hooks -- Provider, mount component, and hooks
- [x] L455 React peer dependency -- React is a peer dependency
- [x] L456 React node content, bounded measurement -- React content inside nodes; Interactive React node content
- [x] L457 no per-pointer-sample state, granularity -- Subscription granularity
- [x] L458 Strict Mode, remount -- Strict Mode and remount safety
- [x] L459 SSR import safety -- Server rendering safety
- [x] L460 focus stability, announce on disappear -- Focus stability
- [x] L464 Two profiles Symbol / React-content publish limits -- Rendering profiles
- [x] L471 Switching profile keeps identities, policies, history -- Rendering profiles (serialization via snapshot contract)
- [ ] L473 Arbitrary React not auto-rasterized/GPU-ported -- no statement; fits Rendering profiles; Image export note
- [~] L469 React-content profile smaller workload; culling, measurement priority -- Rendering profiles has profile limits; no React-content workload or budget
      (no F-REACT)
- [x] L477 independent extension contracts -- Independent extension contracts; Independent extension registrations
- [x] L478 no DOM/Canvas objects in model -- Renderer objects stay behind the boundary
- [x] L479 shared viewport, pointer/focus ownership -- Shared viewport and input ownership; DOM overlay slot
- [x] L480 dirty/invalidation notifications -- Targeted invalidation
- [x] L481 PNG/SVG export SHOULD -- Image export
- [~] L483 Canvas2D/WebGL/SVG choice is an architecture decision -- Canvas2D stacked layers fixes Canvas2D; no recorded "validate against contracts" note

## 11. Transactions, validation, history, and synchronization

- [x] L491 Fig 11.1 lifecycle: preview, plan+opId+rev, atomic apply, reconcile -- Patch as the core change primitive; Atomic patch application; Tagged edits with structured results; Pending layer and edit states
- [x] L504 Local sync acceptance, external async; same tools both -- Local adapter; Server-authoritative collaboration; Pending layer and edit states
- [x] L506 No transport/cache/DB technology assumed -- External authority without duplicate storage; Library read model; Snapshot synchronization mode; Revisioned synchronization mode
- [x] L510 opId, base revision, atomic, changed IDs -- Tagged edits with structured results; Atomic patch application
- [x] L511 five edit states, pending not authoritative -- Pending layer and edit states
- [x] L512 correlation, revision ordering, not lexical -- Order-independent correlation; Revision continuity
- [x] L513 no blind retry -- No blind retry of unknown outcomes
- [x] L514 cached vs commit validation, async identity -- Validation identity; Commit-time revalidation
- [x] L515 responsiveness, serialize/reject conflicts -- Responsiveness during slow host work
- [x] L516 local undo/redo groups, exact restore -- Local undo and redo; Inverse patches
- [x] L517 host-owned history, no hidden stack -- Host-owned history; History availability through the command contract
- [x] L518 external changes not undo entries -- External changes are not local undo entries
- [x] L519 typed events, no half-applied view, reentrancy -- Typed events; Reentrancy contract
- [x] L521-523 Cancel gesture discards only unsubmitted preview -- Submitted edits cannot be cancelled by the view; Gesture lifecycle and cancellation

## 12. Serialization, import, and application data

- [x] L529 versioned JSON document -- Versioned local document format; One graph snapshot shape
- [x] L530 payload codecs -- Payload codecs
- [x] L531 excluded content -- Excluded content
- [x] L532 validate whole import first -- Validate before replace; Shared snapshot validator
- [x] L533 unknown types as placeholders -- Unknown types preserved; Unknown types and missing assets
- [x] L534 deterministic round trip, host formats -- Deterministic round trip
- [x] L535 migration hooks SHOULD -- Format migrations
- [x] L537-539 Asset refs explicit, no server contact on open -- No network access on open; Asset service with host resolver

## 13. Accessibility, diagnostics, trust, and lifecycle

- [x] L547 keyboard focus/select/move/delete/undo/context -- Keyboard editing shortcuts
- [-] L547 keyboard-accessible connection endpoint chooser -- Keyboard editing shortcuts "not required"; config.yaml l.47-48
- [x] L548 visible focus, no trap, not color-only -- Usable shipped controls
- [~] L548 accessible DOM forms, menus, tooltips -- Usable shipped controls covers shipped overlay editors/dialogs only; library ships no menu; tooltips not
      addressed
- [x] L549 localizable, Unicode/IME layout -- Localizable messages
- [x] L550 structured diagnostics -- Structured diagnostics; Structured structural errors
- [x] L551 reduced motion -- Reduced motion
- [x] L552 explicit data editing via commands -- Explicit application-data editing
- [-] L554 Screen-reader explorer deferred -- Usable shipped controls "non-goal"; config.yaml l.47-48
- [ ] L555-556 Document shipped a11y coverage and remaining barriers -- not required anywhere; fits packaging Published support and versioning policy or interaction Usable shipped controls
- [x] L562 untrusted import, no active SVG/HTML -- Untrusted imported content; Asset failure states
- [x] L563 trusted renderer registrations -- Trusted renderer registrations only
- [x] L564 limits, bounded error state -- Limits and bounded failure
- [x] L565 disposal, idempotent -- Per-instance disposal
- [x] L566 suspend hidden, resume -- Suspend when hidden
- [x] L567 missing fonts/workers/context loss -- Resource failure fallback
- [x] L569-572 Callbacks cannot be sandboxed -- Trusted extension boundary documented

## 14. Packaging, platform, and public API

- [x] L578 ESM, d.ts, entries, no TS build -- ESM package with typed entry points
- [x] L579 no server/store/WASM/network -- No required infrastructure
- [x] L580 core in Node -- Headless core in Node
- [x] L581 five examples -- Examples
- [x] L582 no global CSS/fonts/singletons -- No global side effects
- [x] L583 support matrix, licence, bundle, versioning -- Published support and versioning policy
- [x] L584 configurable workers/CSP/webviews -- Configurable optional assets
- [x] L585 tree-shaking, default preset -- Tree-shakable features and default preset
- [x] L587-589 Baseline: Chromium/Firefox/Safari, React 19, ES2022, Node 22 -- Published support and versioning policy; config.yaml support matrix
- [~] L590-591 Touch/pen must not corrupt state; no multitouch/pinch in R1 -- touch long-press only; no touch-safety or pinch non-goal
      stated

## 15. Performance and capacity acceptance

- [x] L602-609 F-SMALL, F-TYPICAL, F-LARGE, F-LIVE fixtures -- Repeatable benchmark suite
- [x] L606 F-ALL all-visible low-detail fixture -- Overview navigation target (target loosened)
- [-] L607 F-REACT fixture -- config.yaml l.49-51 benchmark suite = 4 fixtures
- [-] L608 F-DENSE stress/correctness fixture -- config.yaml l.49-51; Bounded caches only says report dense cases
- [x] L613-614 Reference display 60 Hz, 1440x900, DPR 1 and 2 -- Interaction budgets
- [x] L618 Frame p95 16.7 / p99 33.3 ms -- Interaction budgets (F-REACT dropped)
- [x] L619 Pointer-to-preview p95 33 ms -- Interaction budgets
- [x] L620 Picking p95 2 ms -- Query and update budgets
- [x] L621 Local patch p95 4 ms -- Query and update budgets
- [ ] L622 Obstacle refinement 20 routes p95 100 ms, input responsive -- not in PERF; Bounded asynchronous routing covers async routing without number; fits performance
      Query and update budgets
- [~] L623 F-LARGE projection/index <= 1 s, report first frame separately -- Query and update budgets has 1 s; separate asset/first-usable-frame reporting missing
- [-] L624 F-ALL p95 <= 50 ms -- Overview navigation target sets 33.3 ms as labeled, non-failing target
- [x] L625 F-LIVE navigation, report coalesced updates -- Live update budget
- [x] L626 Bundle 75 / 150 KiB gzip -- Bundle-size budgets
- [x] L627 Idle: no self-sustaining loop -- Idle and lifecycle
- [~] L628 Lifecycle: 30 mount cycles, no heap growth -- Idle and lifecycle checks retained views; no heap-growth check
- [-] L630-632 F-REACT gate concerns defined controls; focused node counts -- follows F-REACT removal
- [~] L638 raw samples, reference-machine provenance -- Repeatable benchmark suite has p50/95/99, seeds, scripts; raw samples and machine provenance not
      required
- [~] L639 meet gates on approved reference machine; targets until measured -- Interaction budgets "labeled targets"; no approved reference machine
      concept
- [x] L640 bounded dirty-driven work -- Bounded dirty-driven work
- [x] L641 index + cull, off-screen endpoints -- Indexed culling and picking; Spatial index requirements
- [x] L642 bounded caches, report worst cases -- Bounded caches; Bounded asset memory
- [x] L643 low-detail keeps junctions/selection/errors -- Low-detail rendering; Level of detail
- [x] L644 baseline editor comparison -- Comparison with React Flow (React Flow)
- [ ] L646-647 Measure >= 30 s after warm-up, repeat 3 times -- Repeatable benchmark suite scenarios use 30 s only; no warm-up/repeat rule; fits performance Repeatable benchmark suite
- [ ] L647-648 Include allocation/long-task traces, route work counts -- fits performance Repeatable benchmark suite
- [ ] L648-649 Do not pool percentiles across machines/browsers/DPR -- fits performance Repeatable benchmark suite (per-browser/DPR reporting is implied only)
- [-] L649-651 Idle/memory recorded separately; memory ceiling after first run -- config.yaml l.49-51 trims heavy performance process; no memory
      ceiling in specs

## 16. Detailed use cases

- [x] Embed a local editor -- Type registration; Custom shapes and portless nodes; Sizes and port layouts; Independent extension registrations; Creatable types and create-at-position; Viewport navigation; Local undo and redo; Versioned local document format; Independent views of one model; No required infrastructure; Provider, mount component, and hooks; Unknown types and missing assets
- [~] Place, move, transform, dock -- Docking requirements; Selection; Group movement with snapping; One committed edit per gesture; Resize handle; Node transforms; Shared node transform; Alignment and snap guides; missing: palette-item drag as an explicit gesture;
      guides are SHOULD
- [~] Connect simple ports -- Connection policy requirements; Connection gestures; Connection-choice request; Port requirements; Screen-space tolerances; missing: keyboard chooser trimmed; port occupancy in candidate
      highlight
- [x] Composite socket -- Signature requirements; Structured policy outcomes; No implicit conversions; Connection-choice request; Per-member branching; Validation identity
- [x] Routed connection -- Routing requirements; Connection identity independent of presentation; Connection gestures; Gesture lifecycle and cancellation; Auto-pan; missing: segment move/split still in change add-route-editing, not in main spec
- [~] Reconnect / disconnect -- Existing binding survives failed reconnection; Atomic assemblies; Undocking preserves connections; Connection gestures; Gesture lifecycle and cancellation; Consistent change notification; missing: undo of reconnect restoring route constraints; whole-
      assembly reconnect
- [x] Dynamic port list -- Stable port addressing; Atomic dynamic port changes; Preview effects of port removal or type change; Stable identities; Stable signature description; Ownership preserved across presentation changes
- [x] Junction -- Junction requirements; Atomic dynamic port changes; Segment snapping, label placement, and crossing styles; Consistent change notification
- [x] Replace, delete, duplicate, paste -- Editing requirements; Atomic assemblies; Explicit junction removal; Local undo and redo; Payload codecs
- [~] React content and provided value -- Provided value requirements; Provider, mount component, and hooks; React content inside nodes; Focus stability; Independent labels and decorations; Interactive React node content; Input scoping; Usable shipped controls; Localizable messages; Explicit application-data editing; missing: source-picker hook not specified
      (no shipped picker)
- [~] Read-only and permissions -- Capabilities and read-only mode; Replaceable connection policy; Existing binding survives failed reconnection; Opt-in and suppressible docking; Atomic delete; Group movement with snapping; Unified commands; Context-menu event; Keyboard editing shortcuts; Usable shipped controls; missing: permission change mid-gesture; keyboard
      connection path trimmed
- [x] Organize visually -- Group requirements; Alignment and snap guides
- [~] External authoritative model -- External authority without duplicate storage; Revision continuity; Immutable read snapshots; Transaction requirements; Commit-time revalidation; Atomic dock commit; One committed edit per gesture; Bounded asynchronous routing; missing: permission change during pending
      edit; status-recovery query
- [x] Save, load, recover -- Serialization requirements; Untrusted imported content; Trusted renderer registrations only; Unknown types and missing assets; Image export; Explicit external-reference handling on paste; Validated paste with fallback; Hierarchical groups; Persistent route constraints
- [x] Share a model across views -- Independent views of one model; Theme tokens and overrides; Targeted invalidation; Correct under layout and display changes; External changes are not local undo entries; No global side effects; Per-instance disposal; missing: alias presentation dropped
- [~] Cancellation, failures, lifecycle -- Gesture lifecycle and cancellation; Auto-pan; Lifecycle requirements; Untrusted imported content; Limits and bounded failure; Strict Mode and remount safety; Server rendering safety; Published support and versioning policy; Configurable optional assets; Order-independent correlation; No blind retry of unknown outcomes; missing: per-tool interrupt-
      source matrix not required
- [~] Large graph -- Performance requirements; Gesture bitmap reuse; Body, painted, and hit bounds; Two-phase hit-testing; Obstacle-aware orthogonal routing; Deterministic and stable routing; Bounded route invalidation; Bounded asynchronous routing; Reduced motion; missing: F-REACT/F-DENSE dropped; no reference hardware or
      memory ceiling
- [x] Customize independently -- Independent extension contracts; Shared viewport and input ownership; Custom shapes and portless nodes; Node transforms; Independent extension registrations; Custom path contract; Decorations without policy; Geometry requirements; Visual requirements; Connection identity independent of presentation; Zero-length connections stay addressable
- [x] Headless and typed commands -- Headless in-memory model; Deterministic ordering; Immutable read snapshots; ESM package with typed entry points; Headless core in Node; Examples; Unified commands; Local undo and redo; Typed events; Reentrancy contract; One policy for all input routes; Signature separate from compatibility policy; Creatable types and create-at-position

## 17. Verification strategy and traceability

- [x] Each requirement references at least one use case -- config.yaml rules.specs; every spec cites UC IDs
- [x] Requirement IDs linked to tests -- AGENTS.md and config.yaml rules.tasks (tests name IDs)
- [~] Completing a use case does not waive unexercised clauses -- practice only (per-MUST evidence rule); not written down
- [~] Verification layer table (headless, property, React, real browser, failure injection, visual, perf, packaging) -- practice only (vitest
      projects, Repeatable benchmark suite; Packaging requirements)
- [~] 17.1 extension acceptance checklist (8 demonstrations) -- partly via Independent extension registrations; Independent extension contracts; Examples examples; not recorded as a list

## 18. R1 completion and implementation sequencing

- [~] Slice table A-E with use-case exit evidence -- slices named in AGENTS.md only; no slice-to-UC mapping in specs
- [x] Prototype work must not silently redefine MUST scope -- AGENTS.md ("don't silently change a requirement")
- [x] R1 criterion 1: every MUST has linked evidence -- AGENTS.md, config.yaml rules.tasks
- [~] R1 criterion 2: all use-case success and failure paths covered -- not recorded as a gate
- [x] R1 criterion 3: local and external ownership both work -- External authority without duplicate storage; Library read model; Local adapter
- [x] R1 criterion 4: both rendering profiles publish measured limits -- Rendering profiles; Performance requirements
- [~] R1 criterion 5: open decisions resolved, omitted SHOULDs listed -- SHOULD tagging exists; no list of omitted SHOULDs
- [~] R1 criterion 6: examples, typed API docs, format docs, migration ship -- Examples; Published support and versioning policy; Format migrations, docs/format.md; API docs not required
- [-] Trimmed scope (aliases, keyboard chooser, replace-node SHOULD, heavy perf process) -- recorded in config.yaml, diverges from slice text

## 19. Explicit decisions still open

- [x] Package name and licence -- config.yaml context, ESM package with typed entry points (publication of notices is Published support and versioning policy, not yet done)
- [~] Exact public API shape -- direction settled (typed adapter/commands/policies); no freeze while pre-release
- [x] Default renderer and router -- config.yaml: Canvas2D, in-house spatial index, orthogonal router
- [~] Reference hardware and memory ceiling -- machine record in baseline JSON only; no named configuration or ceiling in performance
- [x] Browser, React and runtime support -- config.yaml support matrix, Published support and versioning policy
- [~] Default junction materialization -- open: Drop on route requests a branch plan leaves it to the host; no preset decision recorded
- [x] Optional group collapse and export scope -- config.yaml: Group collapse SHOULD, Hierarchical groups MAY, Image export SHOULD, not a gate

## Research notes (docs/archive/research-notes.md)

- [-] L40 "A11y / screen-reader parity is out of scope" -- cfg "no screen-reader parity"; Keyboard editing shortcuts; Usable shipped controls keep keyboard + focus only
- [x] L43 "optimize for AI-legibility: small files, narrow interfaces" -- cfg Code conventions; AGENTS.md
- [-] L46 "WASM-compiling the existing Qt nodeeditor ... rejected" -- No required infrastructure "mandatory WASM" excluded
- [x] L82 "Model is the source of truth; view is a projection" -- Headless in-memory model; Library read model; Independent views of one model, cfg Model placement
- [x] L84 "boundingRect + shape() two-phase hit-testing" -- Two-phase hit-testing; Hit result identity and order; Spatial index contract
- [x] L85 "Paint is a pure function of (state, style, options)" -- Independent extension contracts; Theme tokens and overrides; Renderer objects stay behind the boundary
- [x] L86 "Geometry, style, and painter are three orthogonal axes" -- Independent extension contracts; Independent extension registrations, cfg Node appearance
- [x] L90 "drop signals/slots; QVariant dynamic properties" -- AGENTS.md rejects roles; typed events
- [~] L343 "Model exposes typed selectors / observable slices" -- Consistent change notification; Indexed queries; Subscription granularity cover change notification and subscription granularity; no
      spec for core selector-subscribe API
- [x] L157 "Engine-as-separate-layer ... enforced by directory boundary" -- Headless core in Node, architecture.test.ts, cfg layers
- [-] L164 "Pluggable per-node evaluators ... runtime + symbolic" -- Library has no evaluation engine; Type registration registers types only (app-neutral
      scope)
- [~] L172 "Web Worker offload with a clean shim" -- Only optional router workers: Bounded asynchronous routing; Configurable optional assets; Resource failure fallback; no model/engine worker
- [x] L178 "Incremental dirty propagation ... coalesces patches" -- Dirty-driven frame scheduling; Targeted invalidation; Bounded dirty-driven work; Bounded route invalidation
- [x] L184 "Transactions as discriminated unions ... log, replay, undo" -- Patch as the core change primitive; Commands are planners; Tagged edits with structured results
- [x] L190 "Strict UI-vs-graph store split" -- Separated state categories (ephemeral interaction state separate), PAT/pending layer Pending layer and edit states
- [x] L196 "Wire protocol with schema-driven serialization" -- One graph snapshot shape; Shared snapshot validator; Versioned local document format; Payload codecs (versioned, codecs, validator); schema-table-to-encoder
      generation not adopted
- [x] L202 "Schema-driven node definitions ... single source of truth" -- Type registration; Sizes and port layouts; Stable signature description
- [x] L208 "Multiple model instances keyed by id" -- Independent views of one model; Per-instance disposal per-instance state
- [x] L218 "Define our own Edge/Node types, not React Flow's" -- Headless core in Node; Renderer objects stay behind the boundary; Headless in-memory model
- [x] L220 "Oversized central store file: decompose" -- cfg Code conventions (100-300 lines)
- [x] L227 "Singletons ... won't work in test harnesses or SSR" -- No global side effects; Server rendering safety, cfg "No module-level singletons"
- [x] L232 "any in hot paths ... stricter typing" -- cfg "no any in public or hot paths"
- [x] L237 "No interaction state machine ... must be explicit FSM" -- Tools as explicit state machines, cfg "hand-rolled, no XState"
- [~] L244 "Sibling counting ... O(E) per edge per re-render" -- Bounded dirty-driven work; Indexed culling and picking; Incremental index updates forbid per-event scans; sibling/parallel-edge offset indexing
      not stated (GEO/ROU parallel hit only)
- [-] L248 "No spatial index ... add rbush (R-tree)" -- Spatial index in-house, no rbush: cfg; Spatial index requirements
- [x] L251 "setInterval ticker ... use requestAnimationFrame by dirty flags" -- Dirty-driven frame scheduling; Idle and lifecycle no self-sustaining loop
- [x] L306 "Engine zero imports from view; enforce from day one" -- Headless core in Node, architecture.test.ts
- [~] L309 "Renderer pure fn; swap Canvas2D <-> Pixi" -- Renderer objects stay behind the boundary keeps renderer objects behind boundary; renderer swappability (Pixi/WebGPU) not
      required, cfg fixes Canvas2D
- [x] L318 "Renderer choice: PixiJS vs Canvas2D vs WebGPU; 10k-node stress prototype" -- cfg Rendering: Canvas2D; Repeatable benchmark suite F-LARGE benchmark
- [-] L320 "Host-language registry meets TS node registry; generated bindings?" -- Host-specific; out of library scope (neutrality rule in cfg);
      payload codecs, Type registration
- [x] L322 "Wire routing: orthogonal vs bezier vs magnetic" -- Built-in route modes; Custom path contract
- [x] L324 "sub-graphs / hierarchical components in v1?" -- flat, Group collapse SHOULD, Hierarchical groups MAY (cfg)
- [-] L388 "UndoCommand -> snapshot + Immer + transaction log" -- Patch-based inverse history chosen: Inverse patches; Local undo and redo, cfg Edits; host-owned
      history
- [x] L399 "Style POJO (theme tokens, hover, selection, LOD) as last arg" -- Theme tokens and overrides; Level of detail; Distinct target states
- [x] L406 "spatial index over node AABBs ... edges own index on path bounds" -- Spatial index contract; Indexed culling by painted bounds; Two-phase hit-testing
- [x] L421 "Each axis separately registrable: node/edge/port renderers, geometry, routers, hit testers" -- Independent extension contracts; Independent extension registrations; Separate glyph, target, label, and anchor; Custom path contract
- [x] L494 "routing, rendering, hit-testing for an edge are three slots" -- Custom path contract (path painter/picker), Decorations without policy; Connection identity independent of presentation
- [x] L472 "RouteContext: obstacle bounds, grid, layout hints" -- Persistent route constraints; Port escape and clearance; Obstacle-aware orthogonal routing
- [~] L503 "Custom connection styles: double-line connection, arrows, dashed, dotted, halo" -- Decorations without policy covers labels, arrowheads, dashes, lanes,
      diagnostic decorations; per-kind style registry/examples not specified
- [ ] L507 "End-marker tick: perpendicular tick at the input end" -- No requirement for end-marker decorations beyond arrowheads (domain-specific;
      may be intentionally app-level via Custom path contract)
- [ ] L512 "Transient overlay: temporary overlay edge" -- No transient overlay-edge (non-model) drawing hook; presence hook Presence overlay hook is
      cursors/selections only
- [~] L505, 509 "Animated flow direction / glow when carrying live data" -- reduced motion; live update budget; no animated-
      decoration contract
- [x] L511 "Multi-bond / vector: bundled curve with slash-tick + cardinality label" -- Collapsed and expanded presentation, geometry bundle lanes, Hit result identity and order; Decorations without policy
- [x] L513 "Error / overconstrained: red strikethrough with diagnostic glyph" -- Structured diagnostics; Level of detail (error indicators kept), Decorations without policy diagnostic decorations
- [x] L452 "Stacked split-port at one location" -- Signature requirements; Separate glyph, target, label, and anchor; Independent port properties
- [x] L527 "Capsule / multi-handle fan-in/out as first-class port kind" -- attachment limits, Junction requirements
- [x] L529 "Vector triplet port (future)" -- Signature requirements composite signatures
- [x] L534 "Composition rule: cull then body, ports, edges via cached path" -- Culled painting; Indexed culling by painted bounds; Bounded route invalidation
- [x] L551 "Plugin ships component and renderers as separate registry entries" -- Independent extension registrations; Trusted renderer registrations only trusted renderer registrations; boundary
      correction (557) via Trusted extension boundary documented
- [x] L584 "Library keeps own read model; external adapter; pending layer rollback" -- Library read model; External authority without duplicate storage; Pending layer and edit states; Re-apply pending edits over incoming changes
- [x] L593 "Revision numbers returned with every accepted command" -- Revisioned synchronization mode; Revision continuity
- [x] L595 "Change events carry actual changes (changes@revision)" -- Revisioned synchronization mode, cfg Model placement
- [x] L598 "Commands accept operation ID and base revision; structured accept/reject" -- Tagged edits with structured results; Order-independent correlation; Atomic patch application
- [x] L581, pitfall "Failures only logged; rejected edit stays visible" -- Pending layer and edit states rollback, Validation identity; No blind retry of unknown outcomes
- [x] L281 "DOM overlay for selected-node inline editors" -- DOM overlay slot; Explicit application-data editing
- [x] L279 "Viewport: pan/zoom/transform" -- Viewport navigation; Named coordinate spaces; One transform convention
- [x] L74 "Undo: host must delegate history, no second frontend undo stack" -- Host-owned history; External changes are not local undo entries

## Gaps

Every `[~]` and `[ ]` item with a suggested home spec. Items already marked `[-]` are not gaps.

- [1] L75-77 changes to MUST scope need explicit revision -> process rule only; optional note in packaging
- [1] L93-100 non-goals (workflow execution, value propagation, scheduling, units, nested subgraphs, marketplace, mobile-first) -> safety-lifecycle
      or packaging: add a Non-goals requirement
- [3] L117 typed contracts instead of property lookups -> packaging or canvas-view Independent extension contracts
- [3] L151 hiding a path never deletes a connection -> routing Route-only edits keep topology or canvas-view Level of detail
- [3] L156 render and pick are side-effect free on model data -> canvas-view Renderer objects stay behind the boundary
- [4] L174 snapshot, descriptor and subscription-value lifetime -> graph-model Immutable read snapshots
- [4] L174 external adapters announce changes, never mutate silently -> model-adapters Revisioned synchronization mode or graph-model Immutable read snapshots
- [5/6] L275-277 undirected ports need an opt-in policy -> connection-policy Default undirected preset: record the decision
- [6] L332 equal labels never imply matching keys -> composite-signatures Stable signature description; Signature separate from compatibility policy
- [10] L473 arbitrary React content is not auto-rasterized or GPU-ported -> canvas-view Rendering profiles
- [10] L469 React-content profile workload and budgets -> canvas-view Rendering profiles (benchmark deliberately dropped)
- [10] L483 Canvas2D versus other renderers as a validated decision -> canvas-view Canvas2D stacked layers or config.yaml
- [13] L548 accessible tooltips and menus -> interaction Usable shipped controls
- [13] L555 document shipped accessibility coverage and remaining barriers -> packaging Published support and versioning policy or interaction Usable shipped controls
- [14] L590 touch/pen safety, no pinch or multitouch in R1 -> interaction Gesture lifecycle and cancellation or packaging Published support and versioning policy
- [15] L622 obstacle refinement p95 100 ms for 20 routes -> performance Query and update budgets
- [15] L623 first usable frame and asset load reported separately -> performance Query and update budgets
- [15] L628 heap-growth check across 30 mount cycles -> performance Idle and lifecycle
- [15] L638 raw samples and reference-machine provenance -> performance Repeatable benchmark suite
- [15] L639 approved reference machine gates claims -> performance Interaction budgets
- [15] L646-649 warm-up, three repeats, traces, route work counts, no pooled percentiles -> performance Repeatable benchmark suite
- [16] Use case: Place, move, transform, and dock nodes palette-item drag as an explicit gesture with ghost and guides -> interaction (palette drag) or docking Docking candidate preview
- [16] Use case: Connect simple ports with custom rules candidate highlight shows port occupancy -> ports Distinct target states or interaction Connection gestures
- [16] Use case: Connect simple ports with custom rules; Use case: Respect read-only and fine-grained permissions keyboard connection chooser (trimmed on purpose) -> interaction Keyboard editing shortcuts if reinstated; note trim in connection-policy
- [16] Use case: Draw and revise a routed connection segment move and split not yet in main routing spec -> merge change add-route-editing into routing
- [16] Use case: Reconnect or disconnect safely undo of reconnect restores route constraints; whole-assembly reconnect -> connection-policy Existing binding survives failed reconnection or routing Persistent route constraints
- [16] Use case: Edit React content and consume a provided value source-picker hook for provided values -> provided-values Host-supplied source references
- [16] Use case: Respect read-only and fine-grained permissions; Use case: Use an external authoritative model with slow/reordered replies permission change mid-gesture or pending edit -> connection-policy Commit-time revalidation or graph-model Capabilities and read-only mode
- [16] Use case: Use an external authoritative model with slow/reordered replies status-recovery query for unknown-outcome edits -> model-adapters or patches-and-history No blind retry of unknown outcomes
- [16] Use case: Survive cancellation, failures, and repeated lifecycle changes interrupt-source matrix for every editing tool -> interaction Gesture lifecycle and cancellation or safety-lifecycle Suspend when hidden
- [16] Use case: Navigate, edit, and update a large graph reference hardware, memory ceiling, dense-fixture claims -> performance Repeatable benchmark suite; Interaction budgets
- [17] verification layers, extension acceptance list, use-case completion rule -> config.yaml rules.tasks or packaging
- [18] slice-to-UC exit mapping, R1 completion gates, list of omitted SHOULDs -> config.yaml context or a roadmap doc under docs/
- [19] exact API freeze; reference hardware; default junction materialization -> packaging; performance; junctions Drop on route requests a branch plan
- [R] L343 core selector/slice subscription API -> graph-model Consistent change notification
- [R] L172 worker offload of more than the router -> routing Bounded asynchronous routing: record as router-only
- [R] L244 parallel-edge offsets from an incremental index -> performance Indexed culling and picking or routing Bounded route invalidation
- [R] L309 renderer swappability beyond Canvas2D -> config.yaml decision note; Renderer objects stay behind the boundary keeps the door open
- [R] L503 per-kind connection styles sharing one router -> routing Decorations without policy: add a two-kind scenario
- [R] L507 end-marker decorations at either endpoint -> routing Decorations without policy or record as host-level via Custom path contract
- [R] L512 transient overlay connection that is not in the model -> canvas-view Presence overlay hook or routing
- [R] L505-509 animated flow decoration -> interaction Reduced motion with Bounded dirty-driven work frame budget
- [R] L554 screen-reader explorer deferred (Usable shipped controls non-goal) -> kept dropped; no action
