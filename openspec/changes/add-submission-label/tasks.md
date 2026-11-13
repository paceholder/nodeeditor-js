# Tasks

## 1. The function

- [ ] 1.1 Add `describeIntents` and `IntentLabel` in `src/core/edit/intents/describe.ts` with an exhaustive `switch` on the intent kind (D1 to D3); verify `describe.test.ts` named for the rule that decoded intents are described as data: delete of seven nodes and three connections, multi-select move, a disconnect then a connect in order, the catch-all counting operations, an empty list (named for the empty input scenario), no text or IDs in any entry, and the input unchanged; verify `npm run typecheck` (the core-only pass included) and `npm run lint`
- [ ] 1.2 Export both names from `src/core/index.ts` and raise the ceilings in `scripts/public-surface.test.ts` by exactly two names and one value, with the reason written next to them; verify `npx vitest run scripts/public-surface.test.ts src/view/entry-points.test.ts` and `npm run build`

## 2. Docs

- [ ] 2.1 In `docs/guide-host-authority.md`, after the intent table, show `describeIntents` with a short example that builds a history label from the first entry (host-chosen wording, no library text) and say that undo and redo come from the submission's `origin`; add a line to `CHANGELOG.md` under Unreleased; verify `npm run lint` and a read-through that no sentence calls the library's own `label` a display string for hosts

## 3. Gates

- [ ] 3.1 Run `npm run typecheck`, `npm test`, `npm run test:browser`, `npm run lint`; verify all pass
- [ ] 3.2 Verify `openspec validate add-submission-label --strict` reports no errors, update `openspec/backlog.md` (row for this change; remove the idea line item for P4)
