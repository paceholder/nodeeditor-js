# Tasks

## 1. One field name for refusals

- [x] 1.1 Add `src/core/refusal-field.test.ts` (titled "one field name for refusals") covering a rejected submit, a rejected plan, `can`, a policy reject, a failed `Result`, a refused host verdict and the failure event; rename every refusal field to `rejection` across core, view, react, examples, bench and tests in one commit; verify lint, typecheck, `npm test`, `npm run test:browser`

## 2. One revision type and a checked base revision

- [x] 2.1 Make `Revision` a non-negative integer everywhere and remove `toRevision`; add the `stale-revision` code and the check at submit in the local adapter; tests first in `src/core/edit/adapter/base-revision.test.ts` ("base revision is checked by the local adapter") and `src/core/revision-type.test.ts` ("one revision type"); verify lint, typecheck, `npm test`

## 3. Operation ID constructor

- [x] 3.1 Move `OperationId` next to the entity ID brands, export a validating `operationId(text)` from the core entry and remove `toOperationId`; tests in `src/core/base/ids/operation-id.test.ts` ("operation ID constructor"); verify lint, typecheck, `npm test`

## 4. Accessible name option and prop

- [ ] 4.1 Add `ViewOptions.label` and the live `label` prop in `src/react/node-editor-props.ts`; tests in `src/view/mount-view.browser.test.ts` ("accessible name option") and `src/react/accessible-name.browser.test.ts` ("accessible name prop"); verify lint, typecheck, `npm test`, `npm run test:browser`

## 5. Public surface review

- [ ] 5.1 List the core-entry exports that are low-level math or constants a consumer does not need in `notes.md`; remove only names nothing outside their module uses through the entry; verify `src/view/entry-points.test.ts`, lint, typecheck, `npm test`

## 6. Documentation

- [ ] 6.1 Update the guides, `docs/architecture.md`, README snippets and examples for the new names, the revision type, the base revision check, `operationId` and `label`, and state the boundary of `rejection`, `reason` and `error`; verify lint, typecheck (examples) and a search for the old names

## 7. Gates

- [ ] 7.1 Run lint, typecheck, `npm test`, `npm run test:browser`, `npm run build`, `node scripts/consumer-smoke.mjs` and `openspec validate tidy-public-api-before-first-release --strict`; record in `notes.md`
