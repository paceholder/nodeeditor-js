# Tasks

## 1. Client directive

- [x] 1.1 Write a test that reads the first line of each built entry file; add the directive for the React entry only; verify the test, build and gates

## 2. React layer

- [x] 2.1 Chooser trampoline: failing browser test first, then the fix in `src/react/node-editor.ts`
- [x] 2.2 State hooks read on change only: failing test first
- [ ] 2.3 Viewport and selection carried across a remount: failing test first
- [ ] 2.4 `ref` form beside `onReady`, with cleanup: failing test first
- [ ] 2.5 Command hooks compare arguments by value: failing test first
- [ ] 2.6 Hydration test
- [ ] 2.7 Recommend `useState(() => ...)` in `examples/react` and `docs/guide-react.md`; document the new behaviour

## 3. Packaging

- [x] 3.1 One source-map comment per built file, with a test
- [ ] 3.2 `package.json`: `author`, optional `@types/react` peer; manifest test
- [ ] 3.3 README for the registry page
- [ ] 3.4 `docs/guide-installing.md` (repository URL, resolution note); CHANGELOG, SECURITY, CONTRIBUTING; package-contents test keeps them out
- [ ] 3.5 Workflow hardening: `ci.yml` permissions, `release.yml` environment, branch check, pinned actions, exact npm, `next` tag; `docs/guide-releasing.md`; YAML parse check

## 4. Gates

- [ ] 4.1 Run lint, typecheck, `npm test`, `npm run test:browser`, `npm run build`, the consumer smoke and `openspec validate prepare-first-release-docs-and-workflows --strict`; record in `notes.md`
