# Proposal

## Why

A comparison of `docs/archive/` with `openspec/specs/` found a short list of baseline
statements that are missing or only partly covered: the benchmark method and reference
machine, a few fixtures, an accessibility limit, touch and pen safety, a recorded renderer
decision, adapter change announcements, per-kind connection styling, parallel-edge offset
cost, a verification-layer statement, an extension acceptance checklist, and a drawing
hook for transient non-model connections. Each is a sentence or a scenario, not a feature.
Closing them now keeps the specs the single source of truth before more slices land.

## What Changes

Only sentences and scenarios in existing specs, plus a few new requirements where no spec
requirement is a natural home.

- **performance**: the repeatable benchmark suite rule gains the measurement method (warm-up, three repeats, traces,
  raw samples, machine record, no pooling across machines, browsers or pixel ratios) and
  fixtures F-REACT, F-ALL and F-DENSE; the interaction budgets rule gains the approved reference machine; the query and update budgets rule
  gains the obstacle-refinement budget and separate first-usable-frame reporting; the idle and lifecycle rule
  gains a heap-growth check and a memory ceiling set after the first run.
- **canvas-view**: the Canvas2D stacked layers rule records Canvas2D as the only built-in backend for now; the rule that renderer objects stay behind the boundary says
  render and pick are side-effect free and hiding or low detail never deletes data; the rendering profiles rule
  says arbitrary React content is not rasterized into the canvas and limits are published;
  new the transient overlay connections rule for transient overlay connections that are not in the model.
- **interaction**: new requirement for touch and pen safety, consistent with the existing
  touch pinch zoom rule (a second touch pinches; any other extra pointer is ignored);
  usable shipped controls states the accessibility known limit (keyboard shortcuts, the
  accessible root with its host-replaceable name, shipped DOM controls) and requires
  documenting remaining barriers.
- **model-adapters**: the revisioned synchronization rule requires external adapters to
  announce changes and separates the library's integer revision from the host's own
  revision token.
- **routing**: the decorations without policy rule gains end-point decorations and a per-kind style scenario; the indexed culling and picking rule (in
  performance) says parallel-edge offsets come from an incremental index.
- **packaging**: new verification layers and extension acceptance checklist.
- **graph-model / composite-signatures**: the lifetime wording of immutable read snapshots covers descriptors and
  subscription values; the stable signature description rule says label equality never implies a key match.
- **Tasks only (no spec delta)**: add a non-goals paragraph to `openspec/config.yaml` and
  record the keyboard connection chooser as deliberately dropped there (unless the owner
  approves the separately planned `add-keyboard-navigation`, which would widen that scope);
  verify trackpad pinch, Control-wheel and two-finger pan on a physical device, which the
  view hardening could only test with synthetic events.

Requirements refined: the repeatable benchmark suite rule, the interaction budgets rule, the query and update budgets rule, the idle and lifecycle rule, the indexed culling and picking rule, the Canvas2D stacked layers rule and the rule that renderer objects stay behind the boundary,
the rendering profiles rule, the usable shipped controls rule, the revisioned synchronization rule, the decorations without policy rule, the immutable read snapshots rule and the stable signature description rule. New: the transient overlay connections rule, the touch and pen safety rule, the verification layers rule and the extension acceptance checklist rule.

## Capabilities

### New Capabilities
None.

### Modified Capabilities
- `performance`, `canvas-view`, `interaction`, `model-adapters`, `routing`, `packaging`,
  `graph-model`, `composite-signatures`.

## Out of scope

- Any new feature: no keyboard connection chooser, no screen-reader parity, no multi-touch
  gestures beyond the existing two-touch pinch. Keyboard navigation and announcements are
  proposed in `add-keyboard-navigation`.
- React content inside nodes, worker offload of the engine, aliases, and animated wire
  decorations (power-flow or glow style): deferred, recorded only as non-goals here.
- Items owned by `add-snapshot-sync-adapter`, `add-docking`, `add-reconnect-tool`,
  `add-host-integration-checks` and `add-keyboard-navigation`, and by the archived React
  integration and asynchronous connection policy; this change does not touch
  react-integration, docking, snapshot-mode or async-policy requirements.
- Source code. Requirements here are stated for later slices; the evidence for the new
  statements is docs and checks (see tasks), and benchmark-method items are checked when the
  suite next runs.
