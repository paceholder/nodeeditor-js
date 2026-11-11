# Tasks

## 1. Core entry

- [x] 1.1 Remove the internal math, predicates, record-check helpers, reserved ID kinds and `defaultLimit` from the core entry and its geometry barrel; drop the two test lines that read them; verify lint, typecheck, `npm test`

## 2. Advanced and view entries

- [x] 2.1 Remove the resize, auto-pan, long-press, clipboard-placement and command-registration internals (and the types that served only them) from `view/advanced`, and `DEFAULT_AUTO_PAN` from the view entry; keep the names the entry-point contract test names; verify lint, typecheck, `npm test`

## 3. Guard

- [x] 3.1 Add `scripts/public-surface.test.ts` ("public surface"): removed names absent, name and value ceilings per entry; verify lint, typecheck, `npm test`

## 4. Requirement and notes

- [x] 4.1 Add the delta requirement; record the kept candidates and the removals with reasons in `notes.md`; verify lint, typecheck, `npm test`

## 5. Gates

- [x] 5.1 Run lint, typecheck, `npm test`, `npm run test:browser`, `npm run build`, `node scripts/consumer-smoke.mjs` and `openspec validate shrink-public-surface-before-first-release --strict`; record the results in `notes.md`
