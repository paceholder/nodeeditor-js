# Design

## Context

See proposal.md for motivation. This change consumes, without redefining:

- `add-canvas-view-foundation`: `ViewHandle` with `element`, `viewport`
  (`get`/`set`/`zoomAt`/`panBy`), `clientToWorld`, `pick`, `interaction.add`/`invalidate`,
  the frame scheduler, and the `state.selected`/`state.hovered` inputs of node painters.
- `add-geometry-and-spatial-index`: `Point<Space>`, `Rect<Space>`, `HitCandidate`,
  `GeometryScene.queryRect`, port anchors with normals, `bezierPath`/`straightPath`, and
  `clampZoom`.
- `add-commands-and-policy`: the `moveNodes`, `connect`, and delete planners
  (`edit/commands/transform-nodes.ts`, `connect.ts`, `delete-entities.ts`),
  `ConnectionPolicy.evaluate(proposal, reader)` returning a `PolicyOutcome` (CON-04), and
  `can(command)` / `resolveCapability` for availability.
- `add-patches-and-history`: `submit`, `undo`/`redo`/`historyState`, and change events.

Tools must be testable in Node (INT-05a). They therefore never touch DOM types; only
`src/view/interact/input/` does.

## Goals / Non-Goals

**Goals:**
- One active gesture at a time, always ending in exactly one commit or one cancel.
- A gesture produces at most one submission and one history entry (INT-08).
- Previews never reach the adapter and repaint only the interaction layer.
- The same command IDs are used by shortcuts, the API, and later menus (INT-07).

**Non-Goals:**
- A plugin API for third-party tools beyond registering a `Tool`. The contract is public
  but marked experimental until Slice B adds routing tools.
- Gesture recognizers for touch (pinch, two-finger pan).

## Decisions

### D1. Module layout (each file 100–300 lines)

```
src/view/interact/tools/
  tool-types.ts         ToolInput, ToolEffect, ToolContext, Tool<S>, Modifiers; re-exports
                        the preview shapes
  tool-router.ts        picks the tool on press; holds the single active gesture
  thresholds.ts         drag threshold and capture radii (CSS px), modifier mapping
  select-move-tool.ts   click selection + multi-node move (INT-02, INT-03)
  marquee-tool.ts       rubber-band selection (INT-02)
  connect-tool.ts       drag-to-connect with candidate evaluation (INT-04, PRT-06)
  pan-tool.ts           middle-button / Space+drag pan (INT-01)
  wheel-zoom.ts         cursor-anchored wheel zoom (INT-01, INT-06)
src/view/interact/input/
  dom-input.ts          DOM events -> ToolInput; capture; cancellation sources
  input-scope.ts        focus, text-field, contentEditable, and IME filtering
  effect-runner.ts      executes ToolEffects against view, selection, commands
src/view/interact/selection/
  selection-model.ts    view-local ordered selection + change events
src/view/interact/commands/
  command-registry.ts   EditorCommand registry, availability, run
  builtin-commands.ts   edit.delete, history.*, selection.*, view.*, nodes.nudge
  keymap.ts             chord parsing, platform modifier, default bindings
src/view/render/paint/previews/
  preview-types.ts      ToolPreview and connect candidate shapes (tools import them, so
                        rendering never imports interaction)
  marquee-painter.ts    marquee rectangle (solid for containment, dashed for intersection)
  move-preview-painter.ts  ghosts of moved nodes + incident paths; locked markers
  connect-preview-painter.ts  provisional path + candidate port states with glyphs
```

### D2. Tool contract: pure transitions plus effects

```ts
type ToolInput =
  | { type: "pointer-down" | "pointer-move" | "pointer-up"; pointerId: number; button: 0 | 1 | 2;
      viewport: Point<"viewport">; world: Point<"world">; modifiers: Modifiers; time: number }
  | { type: "wheel"; viewport: Point<"viewport">; deltaY: number; modifiers: Modifiers }
  | { type: "key-down" | "key-up"; key: string; modifiers: Modifiers }
  | { type: "cancel"; reason: "pointercancel" | "lost-capture" | "escape" | "blur" | "hidden" | "dispose" }
  | { type: "entities-removed"; ids: readonly string[] };

type ToolEffect =
  | { type: "capture" | "release"; pointerId: number }
  | { type: "preview"; preview: ToolPreview | null }      // null clears
  | { type: "commit"; command: CommandRequest }           // exactly one per gesture
  | { type: "select"; change: SelectionChange }
  | { type: "viewport"; op: ViewportOp }
  | { type: "cursor"; cursor: CursorKind };

interface Tool<S> {
  readonly id: string;
  readonly idle: S;
  accepts(press: PressInfo, ctx: ToolContext): boolean;   // router consults on pointer-down
  transition(state: S, input: ToolInput, ctx: ToolContext): { state: S; effects: readonly ToolEffect[] };
  isIdle(state: S): boolean;
}
```

`ToolContext` is a read-only facade that tools query and never mutate:
- `pick(viewportPoint)` returns ordered `HitCandidate[]`.
- `reader` is the committed `GraphReader`.
- `selection` is a read-only view of the selection.
- `zoom` is the current zoom level.
- `can(action, ids)` answers capability checks.
- `evaluateConnection(from, to)` returns a CON-04 outcome.
- `anchors(nodeId)` returns port anchors.
- `options` holds thresholds and grid settings.

Each tool's state is a discriminated union, for example the move tool's
`{ kind: "idle" } | { kind: "pressed"; … } | { kind: "dragging"; … }`. A commit or cancel
always returns to `idle` (INT-05a).

*Alternatives considered:*
- XState: rejected by the interview decision.
- Imperative tool classes with DOM listeners: rejected because they are not testable
  headlessly and hide event ownership.

Tests feed `ToolInput` sequences straight into `transition`, with a fake `ToolContext`
built from a real headless model and `GeometryScene`.

### D3. Router and event ownership

On `pointer-down` the router asks tools in a fixed precedence order:

1. Pan: middle button, or Space held.
2. Connect: the topmost hit is a port.
3. Select/move: the hit is a node or connection.
4. Marquee: empty canvas, left button.

The first tool that accepts owns the pointer until it returns to idle. The router emits
`capture` on acceptance, and the runner calls `setPointerCapture`.

While a gesture is active, pointer events from other pointer IDs are ignored. Wheel events
during a gesture still zoom, with the cursor anchor kept. Right-button presses are not
claimed by any Slice A tool, so the ordinary context menu keeps working (INT-04).

Cancellation sources (INT-05) are all mapped to `{ type: "cancel" }` for the active tool:
- `pointercancel` and `lostpointercapture` on the root,
- Escape,
- window `blur`,
- `visibilitychange` to hidden,
- view dispose.

`entities-removed` comes from model change events. A tool whose gesture references a
removed ID (a dragged node, or the connect source port) cancels.

### D4. Thresholds and screen-space units (GEO-05)

| Setting | Default | Unit |
| --- | --- | --- |
| Drag threshold, mouse | 3 | CSS px |
| Drag threshold, touch/pen | 6 | CSS px |
| Port capture radius | 10 | CSS px (overridable per port via anchor `captureRadiusPx`) |
| Connection pick tolerance | 4 | CSS px |

All are measured in viewport space and independent of zoom and DPR. A press released below
the threshold is a click (INT-05 scenario).

### D5. Selection model

`SelectionModel` holds an ordered list of entity keys (`n:<id>`, `c:<id>`) plus a primary
key. Insertion order is the documented tie-break (MOD-08). It emits a `selection` event and
marks the scene layer dirty. It is per view (MOD-10), and removed entities are dropped from
it when change events arrive.

Click semantics:

| Input | Effect |
| --- | --- |
| plain click | replace |
| Shift+click | add |
| Mod+click (Ctrl, or Cmd on macOS) | toggle |
| click on empty canvas | clear |

Marquee semantics follow the CAD convention:
- dragging left-to-right selects entities fully contained in the rectangle;
- dragging right-to-left selects entities the rectangle intersects;
- Shift adds to the selection and Mod toggles.

Candidates come from `GeometryScene.queryRect` (broad phase). Containment is tested against
hit bounds, and intersection uses the precise shape or path distance. The preview paints a
solid rectangle for containment and a dashed one for intersection, so the mode is not
conveyed by color alone (UX-02).

*Alternative considered:* containment only, with a modifier for intersection. Rejected
because engineering users expect the direction convention, and it frees the modifiers.

### D6. Move tool and preview layering

The `pressed → dragging` transition happens past the drag threshold. The moved set is the
selection, or the pressed node if it was not selected; that node is selected on press.
`ctx.can` (backed by `resolveCapability`) splits the set into a permitted part and a locked part (MOD-11,
INT-03).

The offset is snapped by snapping the pressed node's new position to the grid when snapping
is enabled and Alt is not held. All permitted nodes then move by the same snapped offset,
which preserves their relative positions.

Preview: the moved nodes and their incident connections are drawn on the **interaction
layer** at the offset. The scene layer omits them for the duration of the gesture. That
costs one scene repaint at drag start and one at the end, and every pointer move repaints
only the interaction layer (LAY-01, PERF-03). Locked nodes stay in place with a lock glyph.

On release, one `commit` effect carries a move command for all permitted nodes, so one
patch is submitted and one history entry recorded (INT-08). A zero offset after snapping
commits nothing.

*Alternative considered:* applying a presentation offset in the scene layer and repainting
it each move. Rejected because it repaints all visible nodes per pointer event at F-LARGE.

### D7. Connect tool

1. **Press on a port.** The source is `{ node, port }`. Past the threshold the tool enters
   `dragging` and draws a provisional path with the same path builder as committed
   connections, from the source anchor and normal to the pointer.
2. **Candidates.** On each move, ports from `pick` within the capture radius are evaluated
   with `ctx.evaluateConnection(source, candidate)`, which calls the active
   `ConnectionPolicy.evaluate`. Results are cached per candidate port
   for the gesture and keyed by the reader `revision`, so they are recomputed after a model
   change (TXN-05 per-frame cache).
3. **Candidate states (PRT-06).** States are mapped from the policy outcome and occupancy:
   - `compatible`: accept outcome. With an extra occupied mark when attachments already
     exist and the limit allows more.
   - `incompatible`: reject outcome, with the reason.
   - `occupied`: limit exhausted.
   - `unavailable`: capability denied.
   - `pending`: pending outcome.

   Each state has its own glyph (check, cross, ring, lock, hourglass) plus a theme color.
   The hovered candidate shows the reason text (UX-02).
4. **Snapping and release.** The provisional path snaps to the best compatible candidate:
   nearest in screen distance, ties broken by pick order. Release on a compatible candidate
   commits one connect command. The planner revalidates at submission (CON-05), and a
   rejection there comes back as a failure event with no partial state. Release anywhere
   else cancels; no dangling connection is ever created.

### D8. Navigation

- **Wheel** zooms by `factor = exp(-deltaY · k)` around the cursor through
  `viewport.zoomAt`, clamped by `clampZoom` (INT-01). `deltaMode` is normalized to pixels.
- **Option `wheel: "zoom" | "scroll-page-unless-modifier"`** (default `"zoom"`). The wheel
  handler calls `preventDefault` only when it actually changes the viewport. At a zoom limit,
  or in scroll mode without the modifier, the page scrolls normally (INT-06).
- **Pan** is middle-button drag or Space+left drag, applied through `viewport.panBy` (the
  view layer, not the model).
- **`view.fitAll` / `view.fitSelection`** compute world bounds from the geometry scene and
  set the viewport with padding. Empty input is a no-op returning
  `{ ok: true, changed: false }`.
- **`view.resetView`** returns to zoom 1 with the origin at top-left.
- **`view.reveal(id)`** pans and, if needed, zooms out minimally so the entity is fully
  visible.

### D9. Commands and keymap (INT-07, UX-01, INT-06)

```ts
interface EditorCommand<A = void> {
  readonly id: string;                      // "edit.delete", "view.fitAll", …
  readonly labelKey: string;                // localizable key, never a translated string (UX-03)
  availability(args: A, ctx: CommandContext): Availability;  // { available: true } | { available: false; reason: Rejection }
  run(args: A, ctx: CommandContext): CommandOutcome;         // Result-shaped, from submit or view ops
}
```

Built-in commands:
- `edit.delete`: the selection plus required incident connections, through the delete
  planner. Locked entities are rejected with their capability reason.
- `history.undo`, `history.redo`: through the adapter. Availability comes from
  `historyState()`.
- `selection.selectAll`, `selection.clear`.
- `nodes.nudge` with `{dx, dy}`: one move command per key press.
- `view.fitAll`, `view.fitSelection`, `view.resetView`, `view.reveal`.

`ViewHandle.commands` exposes `run(id, args?)`, `availability(id, args?)`, and `list()`.
Shortcuts resolve to the same IDs, so a shortcut and an API call produce identical patches.

Default keymap, where `Mod` is Cmd on macOS and Ctrl elsewhere (detected at mount):

| Keys | Command |
| --- | --- |
| Delete / Backspace | `edit.delete` |
| Mod+Z | undo |
| Mod+Shift+Z and Ctrl+Y | redo |
| Mod+A | select all |
| Escape | cancel the active gesture, otherwise clear the selection |
| Arrows | nudge by the grid step, or 1 world unit without a grid |
| Shift+Arrows | nudge ×10 |

Scoping is handled in `input-scope.ts`:
- The root element is focusable (`tabindex=0`) and keyboard listeners live on it, not on
  `window`. Two editors on one page therefore never share shortcuts.
- Events are ignored when the target is an `input`, `textarea`, `select`, or
  `contentEditable` element (including overlay editors), or when `event.isComposing` is set
  or `keyCode` is 229 (IME).

### D10. Effect runner and commit path

`effect-runner.ts` executes effects in order:
- `capture`/`release` → `element.setPointerCapture`/`releasePointerCapture`;
- `preview` → stored and the interaction layer is invalidated;
- `select` → `SelectionModel`;
- `viewport` → `ViewHandle.viewport`;
- `cursor` → root style;
- `commit` → the editor command path, which plans with `add-commands-and-policy` and submits
  with a fresh operation ID.

A `Deferred` result, which in Slice A only happens for reentrant submits, keeps a "pending"
marker on the preview until it settles (TXN-02 groundwork). A rejection clears the preview
and publishes a `failure` event; the tool is already idle.

## Risks / Trade-offs

- [Hiding moved nodes from the scene layer during a drag adds a scene-layer filter] → The
  filter is a small set lookup in the paint loop. It is measured in `add-perf-baseline`'s
  drag workload.
- [The CAD marquee direction convention may surprise web users] → It is documented, and the
  `marquee: "direction" | "contain" | "intersect"` option lets hosts choose.
- [The default `"zoom"` wheel behavior captures page scrolling over the canvas] → It passes
  through at zoom limits, and scroll mode is one option away. This is documented under
  INT-06.
- [Policy evaluation cost on every move over dense port clusters] → Results are cached per
  candidate per revision, and only ports inside the capture radius are evaluated.
- [Platform modifier detection reads `navigator` at mount] → It is only read at mount
  (REA-06); tests inject the platform explicitly.
