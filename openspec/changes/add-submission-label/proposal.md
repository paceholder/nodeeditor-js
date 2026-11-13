# Proposal

## Why

A host that owns its document and its undo history shows a name for each step, such as
"Delete 7 components". The library already decodes a submission into named intents, but the
host still has to count what each intent holds and write the wording itself. The library's
own `label` on a submission is English text meant for the local history; a host that
controls its language cannot use it. Every host with its own history needs the same small
step: from the intents, a kind and a number.

## What Changes

- **A pure function that describes intents as data.** It takes the intents a submission
  decoded to and returns one short entry per intent: the intent's kind and how many things
  it touches (nodes for a move, resize, rotate, mirror or delete, one for a create node,
  connect, disconnect or reconnect, operations for the catch-all). A delete also reports how
  many connections went with the nodes. It returns no text and no IDs, so the host phrases
  its own label in its own language.
- **Docs.** The host authority guide shows the function next to `decodeIntents` and a short
  example of building a history label from it.
- **Public surface.** Two new core names (the function and its result type); the ceiling
  in `scripts/public-surface.test.ts` rises by exactly those.

No change to the submission, the intents, the adapter or the view. The library's own
`label` stays as it is.

## Capabilities

### Modified Capabilities

- `model-adapters`: a requirement for describing decoded intents as data.

## Impact

- `src/core/edit/intents/` (one new file and its test), `src/core/index.ts` (export).
- `docs/guide-host-authority.md`, `CHANGELOG.md`, `scripts/public-surface.test.ts`.
