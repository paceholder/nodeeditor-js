> **Archived (2026-10-29).** Historical input only. The source of truth is
> `openspec/specs/` (requirements) and `openspec/changes/` (planned work).

# Node Editor — Research Notes

> **Requirements baseline (2026-10-29):**
> [General-Purpose Node Editor Library: Requirements and Use Cases](node-editor-library-design.md).
> Start there for numbered requirements, detailed use cases, local/external model
> adapters, React content, composite ports and provided-value references, custom
> geometry/routing, performance profiles, and release criteria. The specification
> is application-neutral; this file retains the earlier application-specific
> research. Neither document replaces the accepted ADRs.
>
> The exact USB-C/provided-quantity plan is in a host-application
> planning document (extensible port architecture). The requirements baseline
> translates its reusable ideas and the follow-on dynamic-junction plan into
> application-neutral library contracts.

Running notes on options for replacing/augmenting the current React Flow–based
canvas in the host web application. The goal: a model-view framework with custom rendering,
custom shapes/connections, zoom/select, and performance suited to engineering
diagrams (potentially thousands of components). This document is a scratchpad —
append findings as research continues.

## Motivation

- We need engineering-specific connection interactions and routing. Custom
  nodes and edges are available in React Flow's open-source API; they are not
  inherently Pro-only. See its [custom edges guide](https://reactflow.dev/learn/customization/custom-edges).
  The case for replacement is measured performance and architectural fit,
  not a presumed licensing restriction.
- Suspected performance ceiling for engineering-scale diagrams (thousands of
  components, dense bond-graph wiring, live simulation overlays).
- We want full control over rendering primitives, hit-testing, snapping,
  routing, and visual semantics — not just CSS theming over someone else's
  component.

## Constraints / Trade-offs Accepted

- **A11y / screen-reader parity is out of scope.** The host application is a high-performance
  engineering tool; we accept this as a deliberate trade-off rather than
  blocking on a parallel DOM mirror.
- **Generated primarily by Claude Code.** Architecture must optimize for
  AI-legibility: small files, narrow interfaces, exhaustive types, no clever
  metaprogramming, composition over inheritance.
- WASM-compiling the existing Qt `nodeeditor` was considered and rejected as
  too heavy a dependency for a web target.

## Inspirations

### Qt `nodeeditor` (sibling `../nodeeditor`)

A well-known C++/Qt library (the paceholder/QtNodes project). Worth lifting
its **bone structure**, not its C++ ceremony. Relevant abstractions in
`include/QtNodes/`:

- `AbstractGraphModel` — the model interface the view binds against. Decouples
  graph topology/data from rendering.
- `DataFlowGraphModel` — concrete dataflow model (the analogue of what we'd
  build for host-application bonds/signals).
- `BasicGraphicsScene` / `DataFlowGraphicsScene` — scene container holding
  graphics items, managing selection/Z-order.
- `GraphicsView` — viewport, transform, pan/zoom; mirrors `QGraphicsView`.
- `AbstractNodePainter` / `DefaultNodePainter` — strategy pattern for node
  rendering. Painter is **passed** the node state; not stored on the item.
  Direct analogue: pure render functions in our TS port.
- `NodeGeometry` (horizontal/vertical variants) — layout/sizing separated from
  paint. Each node has a `boundingRect` (fast AABB) and a more precise
  `shape()` for hit-testing.
- `NodeStyle` / `ConnectionStyle` / `GraphicsViewStyle` + `StyleCollection` —
  style objects passed at paint time, not baked into items.
- `NodeConnectionInteraction` — interaction state encapsulated as its own
  object. We'd express this as an explicit FSM in TS.
- `UndoCommands` — command pattern for undo/redo. A standalone host can choose
  its own history implementation; the host application must delegate persistent history to
  its backend (a host architecture decision), not introduce a second frontend undo stack.
- `NodeDelegateModelRegistry` — registry for pluggable node types. Direct
  analogue of what `input-output` calls `NodeRegistry` + `NODE_DEFINITIONS`.

**Patterns worth porting verbatim:**

1. Model is **the source of truth**; the view is a projection that subscribes
   to dirty regions.
2. `boundingRect` (fast AABB) + `shape()` (precise) two-phase hit-testing.
3. Paint is a **pure function** of `(state, style, options)` — items don't own
   their look.
4. Geometry, style, and painter are **three orthogonal axes** that compose,
   not inherit.

**Patterns to drop:** signals/slots boilerplate (use plain observables /
Zustand-style stores); `QVariant`-style dynamic properties (use discriminated
unions); manual ownership (GC handles it).

### `input-output`

Read on 2026-06-21. **Important correction to early hypothesis:** this is *not*
a custom node-editor framework. It is a calculator/visualizer **built on top of
`@xyflow/react`** (React Flow v12), with a deep, well-engineered evaluation
engine layered behind a thin React Flow facade.

#### What it actually is

A Next.js 16 + React 19 app that uses React Flow as the canvas, and invests
nearly all its engineering in:

1. A **Brain** dataflow engine that owns graph state, dirty-propagation,
   topological evaluation, and a Web Worker offload path.
2. A **NodeRegistry** of pluggable evaluator/symbolizer functions per node
   type.
3. An **IOGL 1.0** JSON serialization protocol with schema-driven
   encoding/decoding.
4. Domain-specific node UIs (~45 node types: math, calculus, plotting,
   geometry, logic, vector ops, ODE solver, etc.) — every one a React Flow
   custom node.
5. Visual polish on top of React Flow (`MagneticEdge`, `CapsuleHandle`,
   capsule preview state) that bends React Flow into supporting fan-in/out
   multi-handles it doesn't natively do well.

#### Architecture map

```
src/
├── engine/                    # The "Brain" — completely framework-agnostic
│   ├── Brain.ts               # 1424 LOC — main orchestrator, heartbeat (16.67ms)
│   ├── TopologyManager.ts     # Forward + reverse adjacency, dirty propagation
│   ├── TransactionManager.ts  # Command-style transactions (ADD_NODE, MOVE_NODE, …)
│   ├── WorkerOrchestrator.ts  # Web Worker lifecycle + result application
│   ├── BrainWorkerProxy.ts    # Main-thread proxy over postMessage
│   ├── brain.worker.ts        # Worker entry — pure compute, no React Flow
│   ├── NodeRegistry.ts        # Map<type, evaluator>, Map<type, symbolizer>
│   ├── SerializableGraph.ts   # Transport types (must be JSON-safe)
│   ├── Serializer.ts / GraphCodec.ts
│   ├── InputOutputEngine.ts   # mathjs singleton wrapper
│   ├── calculus/              # nerdamer service, mathjs compile cache, runtime guard
│   ├── nodes/                 # Per-domain evaluator definitions
│   │   ├── mathNodes.ts, logicNodes.ts, advancedNodes.ts, …
│   │   ├── Evaluators/        # Pure functions: (node, inputs) → NodePayload
│   │   └── Symbolizers/       # Pure functions: (node, inputs) → ASTNode
│   ├── types/                 # NodeLogic, GraphState, Transaction, …
│   └── iogl/                  # IOGL protocol: Lexer, Parser, Encoder, manifest
├── store/
│   ├── useStore.ts            # Zustand: UI state only (not graph state!)
│   └── useHistoryStore.ts     # Undo/redo as separate slice
├── components/
│   ├── nodes/                 # ~45 React-Flow custom node components
│   │   ├── BaseNode.tsx       # Shared frame; subscribes to Brain via context
│   │   ├── NodeHandle.tsx, SingleHandle.tsx, CapsuleHandle.tsx
│   │   └── …Node.tsx          # One file per node type
│   ├── edges/                 # MagneticEdge (custom), RelinkLine, capsulePreviewState
│   └── hooks/                 # useContentMetrics, useFlexibleResize, …
├── context/                   # BrainContext (DI for the engine)
└── types/                     # NodePayload, ASTNode, NodeDefinition, …
```

#### What's good (steal these)

- **Engine-as-separate-layer.** `src/engine/` has near-zero React imports. It
  exposes a `Brain` class with `getNode`, `getNodesMap`, subscription, and
  transaction APIs. The React Flow components in `src/components/nodes/`
  *subscribe* to the Brain via context but never reach into engine internals.
  This is exactly the model-view split we want, and it's enforced by
  directory boundary rather than convention.

- **Pluggable per-node evaluators.** `NodeRegistry.register(type, evaluator,
  symbolizer?)` lets each node type live in its own file and contribute two
  pure functions: `(node, inputs) → NodePayload` for runtime, and
  `(node, astInputs) → ASTNode` for symbolic formula generation. The dual
  registration (runtime + symbolic) is a *very* nice pattern for an
  engineering tool — it'd let us derive equations from a model in addition to
  simulating it.

- **Web Worker offload with a clean shim.** `WorkerOrchestrator` +
  `BrainWorkerProxy` + `brain.worker.ts` form a 3-file boundary: main thread
  posts transactions and serialized graph patches, worker returns
  `Map<nodeId, NodePayload>`. The shim is small (~115 + ~379 + ~465 LOC) and
  the worker code is pure compute — no UI, no React.

- **Incremental dirty propagation.** `TopologyManager` keeps forward + reverse
  adjacency; `triggerDirtyChain(nodeId)` marks affected descendants;
  `Brain.heartbeat` (16.67 ms / 60 Hz) coalesces patches and dispatches them
  to the worker. This is the right shape for a live-update engineering canvas
  (think simulation play/scrub).

- **Transactions as discriminated unions.** `Transaction = { type, payload }`
  with explicit kinds (`ADD_NODE`, `MOVE_NODE`, `UPDATE_VALUE`,
  `UPDATE_NODE_DATA`, `RESIZE_NODE`, `BATCH`, …). Easy to log, replay,
  serialize, undo. Pairs naturally with command-pattern undo/redo and with
  collaborative editing (CRDT/OT) later.

- **Strict UI-vs-graph store split.** `useStore.ts` holds *only* UI state
  (panel visibility, snap mode, save status, last eval time, highlighted
  paths). Graph state lives in `Brain`. This avoids the common Zustand
  mistake of dumping the whole graph into a single mega-store and re-rendering
  the world on every node move.

- **IOGL protocol** (`engine/iogl/`). A schema-driven JSON serialization
  format with a `manifest.ts` that declares per-node-type schemas (which
  data fields, which outputs, payload type). Encoder/Decoder/Lexer/Parser are
  modular. Worth mining for ideas — our component DSL serialization could
  benefit from the same "schema table → encoder generator" approach.

- **Schema-driven node definitions** (`types/nodeDefinitions.ts` →
  `NODE_DEFINITIONS`). The category, default data, and handle config for each
  node type are declared in one table; `BaseNode.tsx` looks up category to
  drive coloring; the IOGL encoder reads the same table for serialization.
  This is the kind of single-source-of-truth Claude Code is good at extending.

- **Dual-instance separation.** Multiple `Brain` instances are keyed by id
  (`Brain.instances: Map<string, Brain>`), so multiple graphs can run side by
  side. Useful precedent if we ever want sub-graphs / preview canvases.

#### What's mediocre / would not transfer cleanly

- **Couples tightly to React Flow types throughout the engine.** `Brain.ts`,
  `TopologyManager.ts`, `engineTypes.ts` all import `Edge` and `Node` from
  `@xyflow/react`. The "model is pure" property is *almost* there but
  cracked by these direct imports. For a custom canvas we'd need to define
  our own `Edge`/`Node` types in `engine/types/` and let the view layer adapt.

- **`Brain.ts` is 1424 LOC.** One file holding heartbeat, dirty management,
  transaction dispatch, worker callbacks, edge active-state propagation,
  ticker registry, interaction watchdog, and recalculation locking. Will be
  painful for Claude to edit confidently. Decompose along method-cluster
  boundaries — at least a `Heartbeat`, `DirtyChain`, `InteractionGuard`
  split.

- **Singletons.** `InputOutputEngine.getInstance()` and
  `Brain.instances` static map. Works in a Next.js SPA, won't work in
  test harnesses or SSR cleanly. Already evident in
  `InputOutputEngine.reset()` being needed for tests.

- **`any` in hot paths.** `WorkerOrchestrator.workerProxy: any`, mathjs
  instance typed as `any`, evaluator inputs/outputs use `Record<string,
  unknown>` and cast at boundaries. AI agents will be tempted to match this
  style; a stricter typing discipline is essential for our port.

- **No interaction state machine.** Drag/click/connect/select disambiguation
  is spread across React Flow's built-in handlers + ad-hoc `useRef` state in
  `MagneticEdge` and friends (e.g. `dragStartPos`, `RelinkContext`,
  `capsulePreviewState`). For a custom canvas we *must* model interactions
  as an explicit FSM (XState or hand-rolled) from day one — this is the
  single biggest divergence we'd need from `input-output`'s approach.

- **MagneticEdge does a lot in render.** Sibling counting via `useStore`
  selectors that scan `s.edges.filter(...)` on every render is O(E) per edge
  per re-render. Works at calculator scale, not at engineering scale.

- **No spatial index.** Hit-testing and viewport culling delegated entirely to
  React Flow. A custom canvas would add `rbush` (R-tree) here.

- **Visual "ticker" via `setInterval(16.67ms)`.** A 60 Hz heartbeat that's
  always on. Fine for a calculator, wasteful for engineering work where the
  graph is idle most of the time. Use `requestAnimationFrame` driven by
  dirty flags instead.

#### Verdict on `input-output` as a reference

- **As an *editor* reference: low value.** It's React Flow underneath; it
  doesn't solve any of the problems we'd be writing a custom canvas to solve.
- **As an *engine* reference: high value.** The Brain/Topology/Worker/
  Transaction/Registry architecture is the cleanest worked example I've seen
  of how to layer a real dataflow engine behind a node editor in TypeScript.
  We should mirror this layering even if we replace the view layer entirely.
- **As a *plug-in node-type system* reference: high value.** The
  registry + per-type evaluator/symbolizer + schema-manifest pattern maps
  almost directly onto what the host application's `ComponentDef` registry does on the Rust
  side. There's a real opportunity to make the TS-side node-type system
  isomorphic to the Rust-side component-def system, with the IOGL manifest
  generated from the Rust registry.

## Architecture sketch (synthesis)

If we build a custom canvas, layer it like this — Qt nodeeditor's bones, with
input-output's engine patterns:

```
┌─────────────────────────────────────────────────────────┐
│ View Layer  (React shell + Pixi/Canvas2D renderer)      │
│   - Viewport (pan/zoom/transform)                       │
│   - Renderer (pure render fns per node/edge variant)    │
│   - DOM overlay for selected-node inline editors        │
│   - Spatial index (rbush) for hit-test + cull           │
└──────────────────────────▲──────────────────────────────┘
                           │ subscribes to dirty regions
┌──────────────────────────┴──────────────────────────────┐
│ Scene Layer (framework-agnostic, no React)              │
│   - SceneModel: nodes + edges + Z-order + selection     │
│   - Geometry: per-node bounding rect + shape()          │
│   - Style: themes/tokens; passed at paint time          │
│   - InteractionFSM: drag/click/connect/select states    │
└──────────────────────────▲──────────────────────────────┘
                           │ transactions
┌──────────────────────────┴──────────────────────────────┐
│ Engine Layer (pure compute, optionally Web Worker)      │
│   - GraphModel: typed nodes/edges (NOT React Flow types)│
│   - TopologyManager: adjacency + dirty propagation      │
│   - TransactionManager: discriminated-union commands    │
│   - NodeRegistry: per-type evaluator/symbolizer         │
│   - WorkerOrchestrator: optional offload boundary       │
│   - Serializer: schema-driven (host DSL ↔ JSON)       │
└─────────────────────────────────────────────────────────┘
```

Hard rules:

- Engine layer has zero imports from the view layer (no `@xyflow/react`, no
  React, no Pixi). This is the rule `input-output` *almost* follows; we
  enforce it from day one.
- Renderer is a pure function `(ctx, scene, viewport, style) → void`. Swap
  Canvas2D ↔ Pixi without touching scene or engine.
- Interaction is an explicit FSM (XState or hand-rolled discriminated-union
  reducer). All gesture disambiguation lives there.
- One file per node type / tool / renderer; 100–300 LOC ceiling per file for
  AI-legibility.

## Open questions

- Renderer choice: PixiJS vs. raw Canvas2D vs. WebGPU. Decide after a 10k-node
  stress prototype.
- Where does the Rust component registry meet the TS node registry?
  Generated TS bindings? Runtime schema fetch over REST? Both?
- Wire routing: orthogonal/manhattan vs. bezier vs. magnetic — which serves
  bond graphs vs. signal flow vs. hydraulic networks best?
- Do we need sub-graphs / hierarchical components in v1, or is flat enough?

## Qt patterns to NOT port verbatim — JS-idiomatic replacements

Several `QtNodes` abstractions are shaped by Qt's view framework conventions
that don't carry over to TypeScript. Lift the intent, replace the mechanism.

### `Qt::role` + `QVariant` data transfer → typed selectors

In Qt, `AbstractGraphModel::nodeData(NodeId, NodeRole)` returns a `QVariant`
keyed by an enum role (`Position`, `Size`, `CaptionVisible`, `Style`,
`InternalData`, …). The view calls back per role. This exists because Qt's
MVC predates generics and because `QVariant` is the only universal payload.

**Don't port this.** It collapses the model API to one stringly-typed
function, defeats type inference, and forces every consumer to know the role
table. TS has discriminated unions, structural typing, and zero-cost generics
— use them.

**Replacement:** a model exposing typed selectors / observable slices.

```ts
interface SceneModel {
  getNode(id: NodeId): Node | undefined;
  getEdge(id: EdgeId): Edge | undefined;
  getNodePosition(id: NodeId): Vec2;
  getNodeBounds(id: NodeId): Rect;
  getPortInfo(nodeId: NodeId, portId: PortId): PortInfo;
  // …each return type is concrete and inferrable
  subscribe(selector: (s: SceneState) => unknown, fn: () => void): Unsub;
}
```

Renderers subscribe to the slices they actually use; no role enum, no variant
unboxing.

### `QGraphicsItem` inheritance hierarchy → composition + tagged unions

Qt's natural extension model is `class MyNode : public QGraphicsItem` with
virtual `boundingRect()`, `shape()`, `paint()`. Sensible in C++; an anti-
pattern in TS, especially for AI-generated code (inheritance trees are hard
for Claude to navigate confidently).

**Replacement:** node identity is `kind: NodeKind` (a string-literal union).
Behavior is looked up in three independent registries:

```ts
type Node = { id: NodeId; kind: NodeKind; pos: Vec2; data: NodeData };

interface NodeRenderer  { draw(ctx, node, style, vp): void; }
interface NodeGeometry  { bounds(node): Rect; shape(node): Path2D; }
interface NodeBehavior  { onHit(node, p): HitResult; ports(node): Port[]; }
```

Each registry: `Map<NodeKind, T>`. Adding a kind = one entry in each map.
No class, no `extends`. Three known edits in three known places.

### `QObject` signals/slots + `dataModelRegistered()` → plain observables

The Qt event delivery layer doesn't earn its weight in JS. We have closures
and `EventTarget`. Use a small typed event bus or a Zustand-style
subscribable store. The signals registry from `input-output`'s Brain
(`Map<string, Set<listener>>`) is already the right shape — keep it.

### `UndoCommand` polymorphic stack → snapshot + Immer + transaction log

**Scope correction (2026-10-29):** The following is an optional standalone-host
technique, not the host application's history architecture. The host uses backend-owned
undo; see the requirements baseline's external-model/history contract.

Qt's `QUndoStack` of `QUndoCommand` subclasses works, but undo in JS is
better expressed as a stack of immutable scene snapshots (or Immer patches)
paired with the transaction that produced each one. Gives time-travel and
collaborative-edit primitives almost for free.

### `QStyleOptionGraphicsItem` → style tokens passed as plain objects

The Qt pattern (paint state passed in, not stored) is *right* — just drop
the `QStyleOption*` ceremony. Pass a `Style` POJO (theme tokens, hover
state, selection state, LOD level) as the last argument to every render
function. Renderers stay pure; theming is a parameter, not a subclass.

### `QGraphicsScene::itemAt()` → spatial index in the engine

Qt's scene does internal spatial partitioning (BSP) for hit-testing. We're
not getting that for free; add `rbush` (R-tree) over node AABBs and a second
pass against `geometry.shape()` for precision. Edges get their own index
keyed on bounding rects of their path.

## Three-axis independent renderers (nodes / connections / ports)

This is the core extensibility surface and the main reason a custom canvas
beats React Flow. Make **each axis a separate, independently-registrable
renderer** — don't conflate them into a single "node component" the way
React Flow effectively does.

```
┌─────────────────────────────────────────────────────────┐
│ RenderRegistry                                          │
│   nodeRenderers:  Map<NodeKind,       NodeRenderer>    │
│   edgeRenderers:  Map<EdgeKind,       EdgeRenderer>    │
│   portRenderers:  Map<PortKind,       PortRenderer>    │
│   geometries:     Map<NodeKind,       NodeGeometry>    │
│   routers:        Map<EdgeKind,       EdgeRouter>      │
│   hitTesters:     Map<EdgeKind,       EdgeHitTester>   │
└─────────────────────────────────────────────────────────┘
```

### Why three axes (not one)

In a bond-graph / engineering canvas, the orthogonality is real:

- **A mass component** (node) has **2 mechanical ports** (port kind:
  bidirectional mechanical) connected by **bond edges** (edge kind: bond,
  rendered as parallel double-line with effort/flow arrows).
- **A signal source** (different node renderer) has **1 signal port** (port
  kind: signal-out, rendered as a triangle) connected by **signal edges**
  (edge kind: signal, rendered as single arrow).
- **A hydraulic-thermal coupled component** has **two ports stacked at one
  location**: hydraulic + thermal, rendered side-by-side, connecting to
  different edge kinds.

Conflating these into "the node renders its own ports" forces every node
renderer to know every port style and to coordinate with every edge style.
Separating them means: add a new edge kind without touching a single node.

### Renderer interfaces

```ts
interface NodeRenderer {
  draw(ctx: CanvasCtx, node: Node, style: Style, vp: Viewport): void;
  // Body of the component — frame, label, internal visuals.
  // Does NOT draw ports. Does NOT know about edges.
}

interface PortRenderer {
  draw(
    ctx: CanvasCtx,
    port: PortInstance,            // includes resolved position + state
    nodeStyle: Style,
    portStyle: PortStyle,
    vp: Viewport,
  ): void;
  // Connection-point glyph. Hover/connecting/error visuals here.
}

interface EdgeRouter {
  route(src: PortAnchor, dst: PortAnchor, ctx: RouteContext): EdgePath;
  // Pure geometry: anchors → polyline | bezier | orthogonal | custom.
  // RouteContext gives access to obstacle bounds, grid, layout hints.
}

interface EdgeRenderer {
  draw(
    ctx: CanvasCtx,
    edge: Edge,
    path: EdgePath,                // produced by the router
    style: EdgeStyle,
    vp: Viewport,
  ): void;
  // Visual treatment of the path: stroke, dash, arrowheads, decorations,
  // multi-line (bond), animated flow, labels, error halos.
}

interface EdgeHitTester {
  hit(p: Vec2, path: EdgePath, tolerance: number): boolean;
  // Often a stroke-width-expanded path test; router-specific for performance.
}
```

Note: **routing, rendering, and hit-testing for an edge are three separate
slots.** A bond-graph edge can use the same orthogonal router as a signal
edge but a totally different renderer and hit-tester. A custom
"contract-flow" edge can plug in a custom router (manhattan with avoidance)
and reuse the default renderer. The goal is first-class separation of these
contracts, not access to a capability inherently restricted to React Flow Pro.

### Custom connection styles — concrete examples we'll need

- **Bond graph**: parallel double line, effort/flow direction arrows at
  midpoint, color-coded by domain (mechanical = blue, hydraulic = cyan,
  electrical = yellow). Animated power-flow direction during simulation.
- **Signal**: single thin line, single arrowhead at destination, dashed
  while disconnected, glow when carrying live data.
- **Causality marker**: short perpendicular tick at the input end
  showing causality assignment direction.
- **Implicit / activation**: dotted line, no arrow, half-opacity.
- **Multi-bond / vector**: bundled curve with a slash-tick + cardinality
  label.
- **Steady-state initialization overlay**: temporary overlay edge during
  Newton phase, distinct from runtime edges.
- **Error / overconstrained**: red strikethrough with diagnostic glyph.

Each is **one entry in `edgeRenderers`** plus optionally one entry in
`routers`. Nothing else changes.

### Port renderers — examples

- **Default circular handle** (signal, electrical scalar).
- **Triangular arrow** (signal direction-coded).
- **Double concentric ring** (bond — encodes effort/flow pair).
- **Stacked split-port** (thermal-hydraulic coupled location).
- **Capsule / multi-handle** (fan-in/out, à la `input-output`'s
  `CapsuleHandle` but as a first-class port kind, not a node-internal hack).
- **Vector triplet port** (future, per host-application notes).

### Composition rule

The scene/view does the orchestration:

```
for each visible node:
  geometry[node.kind].bounds(node)           // cull check
  nodeRenderers[node.kind].draw(...)         // body
  for each port in behavior[node.kind].ports(node):
    portRenderers[port.kind].draw(...)       // glyph at resolved pos

for each visible edge:
  path = cachedPath ?? routers[edge.kind].route(...)
  edgeRenderers[edge.kind].draw(..., path, ...)
```

No renderer knows about another. Each slot is independently pluggable, unit-
testable in isolation, and replaceable per theme / per project / per plugin.

### Plugin extensibility implication

This matches our DB-backed WASM plugin model
(host-application plugin notes): a plugin can ship a new component **and**
its node/port/edge renderers as separate registry entries. The host doesn't
need to know — it looks up by kind, finds the plugin-provided renderer,
draws.

**Boundary correction (2026-10-29):** The above is a possible future distribution
model, not an existing ABI. A Rust/WASM computational plugin does not
automatically provide a trusted JavaScript painter. The requirements baseline
separates asset data from trusted renderer registration; it does not define a
computational-plugin renderer ABI.

## Q&A: Where does the model feeding the node editor live in the host application?

**Q:** The library asks whether its model is (1) same-page synchronous,
(2) remote/async, (3) the library's local model, or (4) undecided. How does
the current code do it, and what should the host application use with the new library?

**A — current code (the host's schematic editor component):**
de facto option 2 with an informal local copy.

- **Authority:** the Rust backend. Undo is backend-owned.
- **Reads:** React Query fetches `schematic-data` over REST;
  `transformSchematicData` converts it into a second copy held in React
  Flow's own state (`useNodesState` / `useEdgesState`), which is what renders.
- **Writes:** rotate, flip, move, delete and connect are fire-and-forget REST
  calls. Rotate/flip, connect and delete are applied optimistically to the
  local copy; move only calls the backend. Failures are only logged, so a
  rejected edit can stay visible until the next refetch.
- **Sync:** the SSE `tree-changed` event only triggers a full refetch and full
  replacement of the local copy (selection preserved). There are no revision
  numbers or operation IDs, and the event payload is ignored.

**A — recommendation for the new library:** the library keeps its own read
model (3) for rendering, hit-testing and routing; the host application plugs in an
**external adapter** (2) that makes the backend authoritative and owns
history. See
[node-editor-library-design.md §4.1](node-editor-library-design.md#41-qa-where-does-the-model-feeding-the-editor-live).
Unconfirmed edits live in the library's pending layer, so a backend rejection
rolls the view back instead of leaving it diverged.

**Backend follow-ups this requires:**

- Revision numbers on the schematic, returned with every accepted command.
- Change events that carry the actual changes (`changes@revision`) instead of
  a bare "tree changed, refetch" signal.
- Commands that accept an operation ID and base revision, and return a
  structured accept/reject result.

## Decisions log

_(append as we make them)_

- **2026-06-21** — A11y/screen-reader parity dropped as a non-goal. Justified
  by engineering-tool positioning.
- **2026-06-21** — Qt nodeeditor WASM compile rejected as a path.
  Dependency weight too high for the web target.
- **2026-06-21** — `input-output` evaluated. Verdict: not a viable editor
  base (it's React Flow underneath), but its *engine layer* is the best TS
  reference architecture we've found. Mirror its layering; replace its view.
- **2026-10-29** — Model placement: the library always keeps its own read
  model; authority sits behind an adapter. The host application uses an external adapter
  with the backend as the authority and owner of history. See the Q&A above.
