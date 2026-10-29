# Proposal

## Why

Every other Slice A change needs the same foundation: entity records, stable identities,
indexes, and a read API that views, policies, and planners can share. `src/core` is still an
empty stub. This change builds that foundation first. Edits and history come next, in
`add-patches-and-history`.

## What Changes

- Add value types (`Vec2`, `Size`, `QuarterTurns`) and entity records for nodes, ports and
  connections. Records hold the node's view data: position, size, rotation in quarter turns,
  mirroring, and paint order (`z`).
- Add opaque, branded string IDs and an `IdGenerator` contract. The default counter generator
  mints prefixed IDs (`n1`, `p1`, `c1`) from a persisted, monotonic cursor (high-water mark).
- Add a `Result` type, a `Rejection` shape with structural error codes, and `MisuseError` for
  programmer misuse.
- Add an internal `GraphStore`. It holds ordered collections and changes only inside commit
  batches, and keeps its indexes consistent before a batch ends.
- Add indexes by ID, incident connections per node, attachments per port, and neighbors. All
  query results come back in deterministic collection order.
- Add the `GraphReader` read interface and `GraphState` read snapshots. Both are deep-readonly
  and are frozen unless freezing is turned off.
- Add structural validation of records (finite numbers, well-formed IDs, ports that belong to
  their node, endpoints that exist, no duplicate IDs). It returns Result values and never throws.

Requirements implemented:

- Fully: the stable identities rule, the identifier generation rule, the indexed queries rule, the deterministic ordering rule, the structured structural errors rule and the immutable read snapshots rule.
- Partially: the headless in-memory model rule, the separated state categories rule, the consistent change notification rule, the structural integrity versus application validity rule, the independent views of one model rule and the capabilities and read-only mode rule.
  - the store and reader only; public mutation arrives with patches.
  - record categories only; the pending layer is out of scope.
  - batch consistency; notification arrives with events.
  - structural validation is separate from policy.
  - the model holds no view-local state.
  - capability override data on records; enforcement arrives with commands.

Out of scope:

- Patches, events, history and adapters (`add-patches-and-history`).
- Commands, type registry, connection policy and capability enforcement (`add-commands-and-policy`).
- The JSON snapshot shape and save/load (`add-graph-snapshot`).
- Transforms, anchors and hit-testing (`add-geometry-and-spatial-index`).
- Groups, composite members, provided values and route constraints (later slices). Their
  records are not modeled yet, though the ID kinds are reserved.

## Capabilities

### New Capabilities

None. The `graph-model` baseline spec already holds these requirements, so this change only
implements them (`skip_specs: true`).

### Modified Capabilities

None.

## Impact

- New modules under `src/core/` (`base/result.ts`, `base/ids/`, `data/model/`), exported from
  `src/core/index.ts`.
- The core stays headless: no DOM, browser globals or new dependencies, enforced by
  `tsconfig.core.json`.
- Downstream changes build on `GraphReader`, the record types, and `IdGenerator`.
