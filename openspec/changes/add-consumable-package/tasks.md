# Tasks

Each section starts with a verification task. If it passes, keep it as a regression check; if
it fails, the following fix task applies, otherwise mark it "not needed" in `notes.md`.

## 1. Consumer smoke

- [x] 1.1 Add `scripts/consumer-smoke.mjs` and `examples/consumer-smoke/` that packs, installs into a temp project, imports each entry point, runs `vite build` and `tsc --noEmit`, and repeats without React; add a second run that installs from a git URL pinned to a commit into an empty project and imports all four entry points; verify `node scripts/consumer-smoke.mjs` exits 0, covering the consumable-build requirement, the one-import-path rule and the single-React-copy rule
- [x] 1.2 Fix export map, `.d.ts`, peer metadata (React 19 optional peer, ESM only) or install-time build failures (a `prepare` build script with the build tools available at install); verify 1.1 again and `npm run build`
- [x] 1.3 Single React copy: extend the consumer smoke of 1.1 (consumable-build and single-React-copy rules) to bundle a small React component that uses the react entry point and assert the output holds one React runtime (for example by counting the React scheduler or reconciler marker in the bundle, and by a hook call that fails if two copies exist), both from the packed tarball and from a linked folder with the host bundler's dedupe setting; verify the smoke exits 0

## 2. Node versions

- [x] 2.1 The aim is that consumers of `dist/` run on Node 20 and later. Run `npm run build`, `npm test` and the consumer smoke of 1.1 on Node 20 and record which pass; if all do, set the `engines` field of `package.json` to Node 20 and later and update the Node baseline in `openspec/config.yaml` and `AGENTS.md`; if building or testing needs a newer Node, keep that as a development-only requirement (`devEngines` for the tools, and a line in the docs that built files run on Node 20 and later) and record the reason in `notes.md`; verify `npm pack --dry-run` and the docs lint. `package.json` is not changed before this check runs

## 3. Documentation

- [x] 3.1 Add `docs/guide-installing.md`: the consumption path (a git dependency pinned to a tag or commit; a workspace link works only on a developer machine; a registry can come later), the install-time build and what it needs, the Node baseline from 2.1, and `private: true` kept until a registry decision; verify docs lint and the `npm pack --dry-run` file list
- [x] 3.2 In `docs/guide-react.md` and the install guide, state that React is a peer dependency and that a host bundler must resolve one copy (dedupe or alias) when it links the library; verify docs lint

## 4. Gates and tag

- [ ] 4.1 Run `npm run typecheck`, `npm test`, `npm run test:browser`, `npm run lint` and `node scripts/consumer-smoke.mjs`; verify all pass; update `notes.md`; verify `openspec validate add-consumable-package --strict`
- [ ] 4.2 Once 4.1 is verified and the work is committed, create the local tag `0.1.0` on that commit (`git tag 0.1.0`); do not push it, the owner approves pushing separately; verify `git tag --list 0.1.0` names the commit
