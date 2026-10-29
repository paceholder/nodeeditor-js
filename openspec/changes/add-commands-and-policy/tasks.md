# Tasks

## 1. Node type registry

- [ ] 1.1 Add `src/core/data/node-types/definition.ts` and `src/core/data/node-types/registry.ts`; verify `registry.test.ts` "type registration" registers two types independently, rejects a duplicate key with a Result, and lists creatable types in registration order
- [ ] 1.2 Add `src/core/data/node-types/diagnostics.ts`; verify `diagnostics.test.ts` "unknown types and missing assets" shows a node of an unregistered type stays in the state with its payload unchanged across edits and is reported with code `unknown-type`

## 2. Capabilities

- [ ] 2.1 Add `src/core/edit/capabilities/types.ts` and `src/core/edit/capabilities/resolve.ts`; verify `resolve.test.ts` "capabilities and read-only mode" covers the resolution order read-only → host policy → record override → type default → allow
- [ ] 2.2 Add `src/core/edit/capabilities/validator.ts` and register it in `createGraphModel`; verify `capability-validator.test.ts` "API enforcement" rejects a raw move patch on a node with `move: false` with `capability-denied`, and "read-only" denies every edit while reads still work

## 3. Connection policy

- [ ] 3.1 Add `src/core/edit/policy/types.ts` (ConnectionPolicy, ConnectionProposal, PolicyOutcome, ConnectionPlan); verify `npm run typecheck`
- [ ] 3.2 Add `src/core/edit/policy/default-policy.ts`; verify `default-policy.test.ts` "default directed preset" (valid directed, wrong direction, occupied input, cycle allowed, orientation normalized to output→input)
- [ ] 3.3 Verify undirected rules: `default-policy.test.ts` "default undirected preset" covers same domain accepted, different domains rejected with `type-mismatch`, and A→B equal to B→A for duplicate detection
- [ ] 3.4 Verify topology options: `default-policy.test.ts` "policy-controlled topology features" covers self-loops and parallel connections when enabled, each parallel connection having its own ID; "attachment limits" covers limits 0, 1, finite and unlimited, with lowering a limit to 0 keeping existing connections
- [ ] 3.5 Add `src/core/edit/policy/validator.ts` and register it; verify `policy-validator.test.ts` "one policy for all input routes" rejects a raw patch adding an invalid connection with the policy's reason, and "commit-time revalidation" plans a connect, fills the target by another edit, then submits the stale plan and gets `capacity-exhausted`
- [ ] 3.6 Verify policy replacement: `policy-validator.test.ts` "host policy" installs a policy accepting signal→hydraulic and sees it accepted; "structured policy outcomes" checks that a policy returning `choice` yields `execute` status `choice-required` with alternatives and `pending` yields `unverified`

## 4. Command planners

- [ ] 4.1 Add `src/core/edit/commands/types.ts` and `src/core/edit/commands/plan.ts` (exhaustive dispatch); verify `npm run typecheck` fails when a command kind lacks a planner (a `never` check)
- [ ] 4.2 Add `src/core/edit/commands/create-node.ts`; verify `create-node.test.ts` "creatable types and create-at-position" (node at the world position, ports from the spec, front `z`) and "failing type factories" (a throwing or failing factory gives `factory-failed` and an unchanged model)
- [ ] 4.3 Add `src/core/edit/commands/delete-entities.ts`; verify `delete-entities.test.ts` "atomic delete" (node with incident connections removed in one patch, one undo restores everything, any protected entity rejects the whole command) and "commands are planners" (the plan lists removals without applying)
- [ ] 4.4 Add `src/core/edit/commands/connect.ts` (connect, reconnect, disconnect); verify `connect.test.ts` "existing binding survives failed reconnection" (a rejected reconnect leaves the original endpoints and ID) and "connection identity independent of presentation" (reconnect is an update on the same connection ID with no remove/add pair)
- [ ] 4.5 Add `src/core/edit/commands/transform-nodes.ts`; verify `transform-nodes.test.ts` covers moves as one patch, rotation modulo 4 for ±1 turns, mirror toggle, and "explicit reorder" (bring to front changes `z` through a visible update op)
- [ ] 4.6 Add `src/core/edit/commands/set-ports.ts`; verify `set-ports.test.ts` "stable port addressing" (insert and reorder keep attachments), "atomic dynamic port changes" (removing a connected port with `affected: "remove"` removes its connections in the same patch, `"reject"` rejects), and "preview effects of port removal or type change" (a type change's plan lists the incompatible connections before commit)
- [ ] 4.7 Add `src/core/edit/commands/update-node.ts`; verify `update-node.test.ts` "model side" (title, status and payload updates keep the ID and connections)

## 5. Model integration and convenience

- [ ] 5.1 Extend `createGraphModel` with `registry`, `connectionPolicy`, `capabilityPolicy`, `readOnly`, and with `plan`, `execute`, `can`; verify `graph-model-commands.test.ts` "commands are planners" (plan then discard leaves state, history and ID cursor unchanged) and "history availability through the command contract" (`can({ kind: "undo" })` on empty history is unavailable with a reason)
- [ ] 5.2 Add `src/core/edit/commands/convenience.ts`; verify `convenience.test.ts` "convenience methods" (method versus explicit command on two fresh models gives equal results and identical `GraphState` JSON)
- [ ] 5.3 Add a headless end-to-end test `src/core/uc-19-headless.test.ts` "headless editing use case": register types and a policy, create nodes, connect, query adjacency, receive ordered change events, undo and redo, and compare states
- [ ] 5.4 Export the registry, policy, command and capability APIs from `src/core/index.ts` with TSDoc describing the default policy rules; verify `npm run build` emits declarations and `src/core/index.test.ts` imports them
- [ ] 5.5 Run `npm test`, `npm run typecheck` and `npm run lint`; all pass
