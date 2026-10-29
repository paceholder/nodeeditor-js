# Proposal

## Why

With `add-patches-and-history`, callers can only submit hand-built patches. A hand-built patch
can easily get things wrong: forget incident connections, mint IDs incorrectly, or skip
validation. Users and integrators need intent-level commands ("create a node here", "connect
these ports", "delete the selection") planned into correct patches. They also need a connection
policy and capability checks that no input route can bypass. This completes the headless editing
loop that Slice A's the local editor use case, the simple connection use case and the headless editing use case core flows require.

## What Changes

- Add a node type registry holding the model-level parts of a type: label, creatable flag,
  default size, payload factory, initial port specs and capability defaults. Painters and
  geometry are registered separately, in other changes.
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

- Fully: the rule that commands are planners, the convenience methods rule, the creatable types rule, the failing type factories rule, the stable port addressing rule, the independent port properties rule, the attachment limits rule, the replaceable connection policy rule, the default directed preset rule and the default undirected preset rule,
  the policy-controlled topology features rule, the one policy for all input routes rule, the structured policy outcomes rule, the commit-time revalidation rule, the rule that an existing binding survives a failed reconnection, the rule that connection identity is independent of presentation and the capabilities and read-only mode rule (model side).
- Partially:
  - model parts only; appearance and the property editor are not included.
  - model-level placeholder and payload preservation; rendering happens in the view.
  - commands; geometry follows in the geometry change.
  - the plan preview lists the affected connections.
  - atomic delete with incident connections, rejected entirely when any part is
    protected; the allowed-subset plan is Slice B.
  - auxiliary operations are explicit in the plan; no built-in converters.
  - undo and redo command kinds.

Out of scope:

- Composite members, assemblies and provided values (the provided value requirements: Slice C).
- Junction plans (Slice C).
- Resize (the capability-gated resizing rule: Slice B).
- Paste and duplicate (the editing requirements: Slice B, via the snapshot shape).
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
