# Design

## Context

This change builds on `add-graph-model-core` (records, `GraphReader`, `IdGenerator`, `Result`,
`Rejection`) and `add-patches-and-history` (`Patch`, `applyPatch` with the `PatchValidator`
hook, `createGraphModel`, `SubmitResult`, local history). Requirements:
`openspec/specs/{node-types,ports,connection-policy,patches-and-history,graph-model}/spec.md`.

## Goals / Non-Goals

**Goals:**
- Planners are pure functions `(command, ctx) → PlanResult`, so they are trivially testable
  and previews cost no state.
- Validation lives at commit (validators), not only in planners. No route can bypass it
  (CON-03, CON-05).
- The default policy is an ordinary policy object, so hosts replace it without special cases.

**Non-Goals:**
- No UI-facing target-state classification (PRT-06). The policy outcome provides its input,
  and the view change maps it to states.
- No async policies yet.

## Decisions

### Module layout

```
src/core/data/node-types/definition.ts     NodeTypeDefinition, PortSpec, default limits per direction
src/core/data/node-types/registry.ts       createNodeTypeRegistry(): register / get / has / creatable()
src/core/data/node-types/diagnostics.ts    unknown-type diagnostics over a GraphReader
src/core/edit/capabilities/types.ts        Action, CapabilityPolicy, CapabilityContext
src/core/edit/capabilities/resolve.ts      resolveCapability(action, entity, ctx) → Result<void>
src/core/edit/capabilities/validator.ts    capabilityValidator: PatchValidator (maps ops → actions)
src/core/edit/policy/types.ts              ConnectionPolicy, ConnectionProposal, PolicyOutcome, ConnectionPlan
src/core/edit/policy/default-policy.ts     createDefaultConnectionPolicy(options)
src/core/edit/policy/validator.ts          policyValidator: PatchValidator (commit-time revalidation)
src/core/edit/commands/types.ts            Command union, PlanResult, PlanEffects, ExecuteResult
src/core/edit/commands/plan.ts             exhaustive dispatch by command kind → planner
src/core/edit/commands/create-node.ts
src/core/edit/commands/delete-entities.ts
src/core/edit/commands/connect.ts          connect / reconnect / disconnect
src/core/edit/commands/transform-nodes.ts  moveNodes / rotateNodes / mirrorNodes / reorderNodes
src/core/edit/commands/set-ports.ts
src/core/edit/commands/update-node.ts
src/core/edit/commands/convenience.ts      methods bound onto the model facade
```

### Node type registry

```ts
interface NodeTypeDefinition {
  readonly type: string; readonly label: string; readonly creatable?: boolean;  // default true
  readonly defaultSize: Size;
  readonly createPayload?: (ctx: { position: Vec2 }) => Result<Payload>;
  readonly ports?: (payload: Payload) => readonly PortSpec[];
  readonly capabilities?: CapabilityOverrides;
}
interface PortSpec {
  readonly direction: PortDirection; readonly typeKey: string;
  readonly limit?: AttachmentLimit;   // default: input 1, output and undirected "unlimited"
  readonly label?: string; readonly placement?: PortPlacement;
}
```

- `register` rejects a duplicate type key with a Result. `creatable()` lists types in
  registration order, which is deterministic.
- Appearance, geometry and painter are not part of this definition. They are registered by
  type key in the geometry and view registries, so changing one never touches another
  (NOD-01, NOD-08).
- A factory that throws or returns `ok: false` becomes a `factory-failed` rejection, and
  nothing is planned (NOD-09a).

### Commands and planning

```ts
type Command =
  | { kind: "createNode"; type: string; position: Vec2; payload?: Payload; title?: string }
  | { kind: "deleteEntities"; nodes?: readonly NodeId[]; connections?: readonly ConnectionId[] }
  | { kind: "connect"; from: Endpoint; to: Endpoint; connectionKind?: string }
  | { kind: "reconnect"; connection: ConnectionId; end: "from" | "to"; target: Endpoint }
  | { kind: "disconnect"; connection: ConnectionId }
  | { kind: "moveNodes"; moves: readonly { node: NodeId; position: Vec2 }[] }
  | { kind: "rotateNodes"; nodes: readonly NodeId[]; turns: 1 | -1 }      // clockwise quarter turns
  | { kind: "mirrorNodes"; nodes: readonly NodeId[] }
  | { kind: "reorderNodes"; nodes: readonly NodeId[]; to: "front" | "back" }
  | { kind: "setPorts"; node: NodeId; ports: readonly PortEdit[]; affected: "remove" | "reject" }
  | { kind: "updateNode"; node: NodeId; title?: string; status?: string; payload?: Payload }
  | { kind: "undo" } | { kind: "redo" };

type PlanResult =
  | { kind: "ready"; patch: Patch; label: string; effects: PlanEffects }
  | { kind: "rejected"; error: Rejection }
  | { kind: "choice"; alternatives: readonly { label: string; command: Command }[] }
  | { kind: "pending"; reason: string };
```

- `plan()` reads the state and the ID cursor but writes nothing. New IDs come from the pure
  generator, and the new cursor rides on `patch.idCursor`. A discarded plan therefore leaves
  the model, history and high-water mark untouched (PAT-04).
- `execute()` plans and then, if the plan is ready, submits it. It returns
  `ExecuteResult = SubmitResult | { status: "choice-required"; alternatives } | { status: "unverified"; reason }`,
  which surfaces CON-04 outcomes without a Boolean. `undo` and `redo` route to the history.
- `can(command)` returns `{ available: true } | { available: false; reason: Rejection }` by
  planning without submitting. Menus and shortcuts can use it (PAT-08, INT-07).
- Convenience methods (`createNode`, `connect`, `disconnect`, `reconnect`, `deleteEntities`,
  `moveNodes`, `rotateNodes`, `mirrorNodes`, `setPorts`, `updateNode`) build the command and
  call `execute`, so the result is identical by construction (PAT-05).
- `PlanEffects` (`created`, `removed`, `updated` ID lists) is the preview used by PRT-07 and
  EDT-02. For example, `setPorts` lists the connections it would remove.
- Specific planners:
  - `createNode`: ports are created from the spec with fresh IDs, `z` is set to the front
    (current max + 1), and `position` is the world position of the node-local origin.
  - `deleteEntities`: removes the listed connections, the listed nodes, their ports, and all
    incident connections, in that order.
  - `reconnect`: an update of `from` or `to` on the same connection ID (CON-07, CON-08).
  - `setPorts`: the desired port list. Entries carrying an `id` update that port (label,
    type, limit, placement), entries without one are added, and missing ports are removed.
    Connections on removed ports, or on ports whose type or direction change and become
    invalid, are either removed (`affected: "remove"`) or cause a rejection (`"reject"`).

### Connection policy

```ts
interface ConnectionProposal { from: Endpoint; to: Endpoint; kind?: string; replacing?: ConnectionId }
type PolicyOutcome =
  | { kind: "accept"; plan: ConnectionPlan }
  | { kind: "reject"; reason: Rejection }
  | { kind: "choice"; alternatives: readonly ConnectionPlan[] }
  | { kind: "pending"; reason: string };
interface ConnectionPlan {
  readonly from: Endpoint; readonly to: Endpoint;     // normalized orientation
  readonly connectionKind: string;
  readonly auxiliary: readonly PatchOp[];             // explicit extra effects (CON-06), usually empty
}
interface ConnectionPolicy { evaluate(p: ConnectionProposal, graph: GraphReader): PolicyOutcome }
```

`createDefaultConnectionPolicy({ selfLoops = false, parallel = false })` checks, in order:

1. Both endpoints exist and are different ports; otherwise `not-found` or `same-port`.
2. Direction. Two undirected ports are allowed. An output and an input are normalized to
   `from = output`. Anything else is `direction-mismatch`.
3. Equal `typeKey`; otherwise `type-mismatch`.
4. Self-loop on the same node is rejected (`self-loop`) unless enabled.
5. Duplicates are compared as ordered pairs when directed and unordered pairs when undirected,
   so drawing order is irrelevant (CON-01b). Rejected with `duplicate-connection` unless
   parallel connections are enabled.
6. Attachment limit at each port, excluding the connection being replaced; otherwise
   `capacity-exhausted`.

Cycles are never checked, so they are allowed. Hosts replace the policy object, or wrap the
default and delegate to it (CON-01).

- *Alternative considered:* `canConnect(): boolean` as in QtNodes. Rejected by CON-04: it
  cannot explain reasons, normalize orientation, or offer choices.

### Commit-time validators

- `policyValidator` revalidates against the staged post-patch state, through a reader that
  hides the connection being checked. It covers every connection `add`, every `from`/`to`
  update, and every connection attached to a port whose `typeKey` or `direction` the patch
  changes. Any outcome other than `accept` rejects the patch. `choice` maps to
  `choice-required` and `pending` to `pending-validation`. This covers commands, raw patches
  and undo alike (CON-03, CON-05).
- `capabilityValidator` maps operations to actions:
  - position → `move`; rotation → `rotate`; mirrored → `mirror`
  - remove → `delete`; connection add → `connect` on both nodes
  - connection remove or endpoint update → `detach`
  - ports → `editPorts`; payload, title or status → `edit`

  Any denied action rejects the patch with `capability-denied`, naming the action and entity.
- Resolution order is: model `readOnly` (denies every edit) → host `capabilityPolicy` → record
  `capabilities` overrides → type defaults → allow. View-local restrictions (later) may narrow
  this but never relax it (MOD-11).
- Patches with origin `external` (Slice D) will skip these validators, because the authority
  has already decided. Undo and redo do not skip them, so undoing a move on a node that has
  since been locked is rejected with a reason.

## Risks / Trade-offs

- **[Planners and validators both run the policy, so it executes twice]** → Policy checks are
  O(degree). The duplication is what CON-05 requires.
- **[Reading paint order "front = max z + 1" needs the max z]** → It is kept as an index
  maintained by the store, O(1) per query.
- **[`setPorts` has a large surface]** → It is one file with exhaustive tests per edit kind,
  and the preview lists every effect before commit.
- **[Rejecting undo after a capability change may surprise users]** → The reason is returned
  and published as a `failure` event. The view shows it (Slice B).
