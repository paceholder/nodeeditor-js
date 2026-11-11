## Why

The pre-release audit found rough edges in the public API that are cheap to fix now and
expensive after the first release, because the package has no consumers yet and the owner
has approved breaking changes:

- A refusal is reported under three field names: `error` (results, rejected outcomes, plan
  results), `reason` (availability, policy outcomes, host verdicts, the React command hook)
  and `rejection` (failure events, view events, context menus).
- There are two revision types: a number on the reader and the graph state, and a text
  token such as `"r3"` on the model, accepted outcomes and events.
- `operationId` and `baseRevision` in submit options cannot be filled without a cast,
  because the constructors are not exported, and the local adapter never checks
  `baseRevision`.
- The root's accessible name can only be changed by writing the attribute after mount;
  there is no mount option or React prop for it.
- The core entry exports low-level math and constants that a consumer does not need.

## What Changes

- **BREAKING** Every field that carries a refusal is named `rejection`: the failure side of
  `Result`, the rejected submit outcome, the rejected plan result, command availability,
  the policy's reject outcome, the host verdict, the verdict lookup, view command
  availability and the React command hook. `reason` stays only for plain-text explanations
  of states that are not refusals (pending validation, unknown outcome, cancelled gesture,
  history labels); `error` stays only for values thrown by host code.
- **BREAKING** One revision type: `Revision` is a non-negative integer everywhere (model,
  reader, graph state, outcomes, events, validator requests). `toRevision` is removed.
- The local adapter checks `baseRevision`: a submission whose base revision is not the
  current revision is rejected with the new code `stale-revision` and changes nothing.
- **BREAKING** The core entry exports a validating `operationId(text)` constructor,
  like `nodeId`; the internal cast helper `toOperationId` is removed.
- A `label` mount option names the view's root for assistive technology (default
  "Node editor"), with a matching `NodeEditor` prop that updates the mounted view.
- A public surface review of the core entry, recorded in `notes.md`; only exports that
  nothing outside their own module uses through the entry are removed.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `patches-and-history`: new requirement "One field name for refusals".
- `graph-model`: new requirements "One revision type" and "Operation ID constructor".
- `model-adapters`: new requirement "Base revision is checked by the local adapter".
- `canvas-view`: new requirement "Accessible name option".
- `react-integration`: new requirement "Accessible name prop".

## Impact

- Core: `src/core/base/result.ts`, `src/core/base/ids/ids.ts`, `src/core/edit/adapter`,
  `src/core/edit/commands`, `src/core/edit/policy`, `src/core/graph-model.ts`,
  `src/core/index.ts` and every caller.
- View: availability and command types, the layer stack, mount options.
- React: the command hook, the prop table in `src/react/node-editor-props.ts`.
- Docs, guides, README snippets and examples that show the old names.

## Out of Scope

- Revisioned synchronization with host revision tokens: a host's own token (snapshot push
  revision, server revision) stays a separate value, as the snapshot adapter plan says.
- Shrinking the view and advanced entries; the review covers the core entry and lists
  candidates rather than removing used names.
- Removing requirement codes from shipped declaration comments (a separate audit item).
