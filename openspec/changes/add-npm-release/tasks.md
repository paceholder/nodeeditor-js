# Tasks

## 1. Package metadata

- [x] 1.1 Remove `private`, add `publishConfig.access`, registry fields and `prepublishOnly` in `package.json`; update the text that says `private: true` is kept; verify lint, typecheck, tests, `npm pack --dry-run`

## 2. Contents test

- [x] 2.1 Add a node test titled "published package" that checks the `npm pack --dry-run --json` file list and metadata; verify it passes

## 3. CI

- [x] 3.1 Update `.github/workflows/ci.yml`: Node 20 and 22 matrix and a consumer smoke job; verify the YAML parses and the smoke passes locally

## 4. Release workflow

- [x] 4.1 Add `.github/workflows/release.yml` (tag trigger, tag equals version check, gates, smoke, publish with provenance through trusted publishing); verify the YAML parses

## 5. Documentation

- [ ] 5.1 Add `docs/guide-releasing.md`; update `docs/guide-installing.md` and `README.md`; verify lint

## 6. Gates and tag

- [ ] 6.1 Run lint, typecheck, `npm test`, `npm run test:browser`, `npm run build`, the consumer smoke and `openspec validate add-npm-release --strict`; record in `notes.md`; recreate the local tag `0.1.0` on the final commit (not pushed)
