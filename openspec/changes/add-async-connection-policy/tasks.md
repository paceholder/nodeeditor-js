# Tasks

## 1. Verdict cache and wrapper (core/edit)

- [ ] 1.1 Add `proposalSignature` and the `ConnectionValidator` / `ConnectionVerdict` / request types, exported from `src/core/index.ts` (D2, D3); verify `proposal-signature.test.ts` titled CON-09, CON-01b: the same ports give one signature, undirected pairs are order independent, a different kind, choice or `replacing` gives another
- [ ] 1.2 Implement `createVerdictCache` (in-flight map, LRU, revision floor, abort, subscribe, dispose) (D2, D3, D4); verify `verdict-cache.test.ts` titled CON-09, TXN-05 with a fake async validator: one call for 50 evaluations, late verdict for another signature stored apart, older-revision verdict discarded, failure and timeout become coded rejections, dispose aborts and clears, a floor advance drops affected entries
- [ ] 1.3 Implement `createValidatedPolicy(base, cache)` (D1); verify `validated-policy.test.ts` titled CON-04, CON-09, CON-05: base reject is returned without a validator call, base accept with miss gives `pending` then `accept` with the base plan after a valid verdict, `choice` outcomes pass through, commit `revalidate` returns `pending-validation` for a missing verdict and passes for a valid one, and a programmatic connect without a verdict returns `unverified`
- [ ] 1.4 Run `npm run typecheck` and `src/architecture.test.ts`; verify core still typechecks with no DOM lib (`tsconfig.core.json`) and no new wrong-way import

## 2. Connect tool (view/interact)

- [ ] 2.1 Add the `awaiting` state, the `verdict` input and the `validate-wait` effect to the connect tool, with the cancellation set of INT-13 (D5); verify `connect-tool.test.ts` additions titled INT-13, INT-05, INT-08: pending during drag, release then accepted submits one connect, release then rejected commits nothing, Escape, new press, target removal and dispose each abort and ignore a later verdict, "New press while waiting" starts a new gesture
- [ ] 2.2 Wire the cache to the mount layer: bind `subscribe` to a model-binding invalidate, deliver `verdict` inputs, add the `onRejection` view option, forward `abort` on cancel (D4, D5); verify `src/view/async-policy.browser.test.ts` titled INT-13, CON-10, PRT-06 in Chrome: the pending cue changes to compatible with no pointer movement, the rejection callback receives code and message, pan works while pending, and one undo removes the created connection
- [ ] 2.3 Add a pending cue that is not color alone to the target-state painter (PRT-06, UX-02); verify the existing target-state paint test gets a "pending is distinct from compatible, incompatible and choice-required" case and the browser test above checks the painted glyph differs

## 3. Docs and gates

- [ ] 3.1 Document the validator recipe (signature, cache, wait semantics, timeout, `onRejection`) in `docs/guide-using-the-model.md` and `docs/guide-view.md`, and add it to `examples/plain-js` with a fake delayed validator; verify `npm run demo` shows the pending cue then the accepted state, and `npm run lint`, `npm run typecheck`, `npm test` and `npm run test:browser` pass
