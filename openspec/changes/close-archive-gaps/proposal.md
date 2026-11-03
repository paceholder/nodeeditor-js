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

Only sentences and scenarios in existing specs, plus a few requirement IDs where no spec
requirement is a natural home.

- **performance**: PERF-01 gains the measurement method (warm-up, three repeats, traces,
  raw samples, machine record, no pooling across machines, browsers or pixel ratios) and
  fixtures F-REACT, F-ALL and F-DENSE; PERF-02 gains the approved reference machine; PERF-02a
  gains the obstacle-refinement budget and separate first-usable-frame reporting; PERF-02d
  gains a heap-growth check and a memory ceiling set after the first run.
- **canvas-view**: LAY-01 records Canvas2D as the only built-in backend for now; REN-02 says
  render and pick are side-effect free and hiding or low detail never deletes data; REN-06
  says arbitrary React content is not rasterized into the canvas and limits are published;
  new OVL-04 for transient overlay connections that are not in the model.
- **interaction**: new INT-05c for touch and pen safety; UX-02 states the accessibility
  known limit and requires documenting remaining barriers.
- **model-adapters**: ADP-06 requires external adapters to announce changes.
- **routing**: ROU-09 gains end-point decorations and a per-kind style scenario; PERF-04 (in
  performance) says parallel-edge offsets come from an incremental index.
- **packaging**: new PKG-11 verification layers and PKG-12 extension acceptance checklist.
- **graph-model / composite-signatures**: MOD-13 lifetime wording covers descriptors and
  subscription values; SIG-01 says label equality never implies a key match.
- **Tasks only (no spec delta)**: add a non-goals paragraph to `openspec/config.yaml` and
  record the keyboard connection chooser as deliberately dropped there.

Requirement IDs refined: PERF-01, PERF-02, PERF-02a, PERF-02d, PERF-04, LAY-01, REN-02,
REN-06, UX-02, ADP-06, ROU-09, MOD-13, SIG-01. New: OVL-04, INT-05c, PKG-11, PKG-12.

## Capabilities

### New Capabilities
None.

### Modified Capabilities
- `performance`, `canvas-view`, `interaction`, `model-adapters`, `routing`, `packaging`,
  `graph-model`, `composite-signatures`.

## Out of scope

- Any new feature: no keyboard connection chooser, no screen-reader parity, no multi-touch
  gestures.
- React content inside nodes, worker offload of the engine, aliases, and animated wire
  decorations (power-flow or glow style): deferred, recorded only as non-goals here.
- Items owned by `add-react-integration`, `add-snapshot-sync-adapter`,
  `add-async-connection-policy`, `add-docking`, `add-reconnect-tool` and
  `add-host-integration-checks`; this change does not touch react-integration, docking,
  snapshot-mode or async-policy requirements.
- Source code. Requirements here are stated for later slices; the evidence for the new
  statements is docs and checks (see tasks), and benchmark-method items are checked when the
  suite next runs.
