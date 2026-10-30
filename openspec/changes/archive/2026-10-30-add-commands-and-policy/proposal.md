# Proposal

## Why

With `add-patches-and-history`, callers can only submit hand-built patches. A hand-built patch
can easily get things wrong: forget incident connections, mint IDs incorrectly, or skip
validation. Users and integrators need intent-level commands ("create a node here", "connect
these ports", "delete the selection") planned into correct patches. They also need a connection
policy and capability checks that no input route can bypass. This completes the headless editing
loop that Slice A's UC-01, UC-03 and UC-19 core flows require.

## What Changes

- Add a node type registry holding the model-level parts of a type: label, creatable flag,
  default size, payload factory, initial port specs and capability defaults. Painters and
  geometry are registered separately, in other changes (NOD-08).
- Add a `Command` discriminated union and one planner per command kind. Each planner turns the
  command into a complete patch plus an effects summary, without applying it. Command kinds:
  `createNode`, `deleteEntities`, `connect`, `reconnect`, `disconnect`, `moveNodes`,
  `rotateNodes`, `mirrorNodes`, `reorderNodes`, `setPorts`, `updateNode`, `undo`, `redo`.
- Add model methods: `plan(command)` for previews, `execute(command)`, `can(command)` for
  availability with a reason, and convenience methods such as `connect(a, b)` and
  `createNode(type, at)`.
- Add the `ConnectionPolicy` contract with structured outcomes (accept with plan, reject with
  reason, choice required, pending). The default policy handles directed output→input and
  undirected connections with equal type keys, attachment limits, no self-loops or duplicates
  by default, and allows cycles.
- Add capability resolution: read-only mode, host policy, per-record overrides, then type
  defaults.
- Register the connection policy and capabilities as commit-time `PatchValidator`s. Commands,
  raw patches and undo all pass the same checks, and connections are revalidated at commit.
- Add a placeholder rule at model level: nodes of unregistered types stay intact and are
  reported through a diagnostic query. Creating a node of an unknown type is rejected.

Requirements implemented:

- Fully: PAT-04, PAT-05, NOD-09, NOD-09a, PRT-01, PRT-03, PRT-04, CON-01, CON-01a, CON-01b,
  CON-02, CON-03, CON-04, CON-05, CON-07, CON-08, MOD-11 (model side).
- Partially:
  - NOD-01: model parts only; appearance and the property editor are not included.
  - NOD-07: model-level placeholder and payload preservation; rendering happens in the view.
  - PRT-02: commands; geometry follows in the geometry change.
  - PRT-07: the plan preview lists the affected connections.
  - EDT-02: atomic delete with incident connections, rejected entirely when any part is
    protected; the allowed-subset plan is Slice B.
  - CON-06: auxiliary operations are explicit in the plan; no built-in converters.
  - PAT-08: undo and redo command kinds.

Out of scope:

- Composite members, assemblies and provided values (SIG-*, REF-*: Slice C).
- Junction plans (Slice C).
- Resize (NOD-04a: Slice B).
- Paste and duplicate (EDT-03 to EDT-05: Slice B, via the snapshot shape).
- Allowed-subset delete plans.
- Asynchronous host validators producing `pending` at commit (Slice D). The outcome type
  exists now, and the default policy never returns it.

## Capabilities

### New Capabilities

None. The requirements live in the `patches-and-history`, `node-types`, `ports`,
`connection-policy` and `graph-model` baseline specs (`skip_specs: true`).

### Modified Capabilities

None.

## Impact

- New modules `src/core/data/node-types/`, `src/core/edit/commands/`,
  `src/core/edit/policy/` and `src/core/edit/capabilities/`.
- `createGraphModel` gains the options `registry`, `connectionPolicy`, `capabilityPolicy` and
  `readOnly`, plus the methods `plan`, `execute` and `can`, and convenience methods.
- No new dependencies. The core stays headless.
