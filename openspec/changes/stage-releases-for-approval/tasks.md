# Tasks

## 1. Workflow

- [x] 1.1 Replace the publish step of `.github/workflows/release.yml` with `npm stage publish` and pin npm 11.21.2; verify `scripts/workflows.test.ts` named for the guarded release automation rule: the release stages the version for a maintainer's approval and never publishes directly, and a pre-release version is staged under the next dist-tag

## 2. Docs

- [x] 2.1 Describe the trusted publisher's allowed actions, the approval step and the rejection of a staged version in `docs/guide-releasing.md`; verify by a read-through

## 3. Owner settings and first use

- [ ] 3.1 On npmjs.com clear "Allow npm publish" on the trusted publisher once 0.2.0 is out; verify in the package settings
- [ ] 3.2 Make the next release through the staged step and approve it on npmjs.com; verify the run is green, the version appears under "Staged Packages", and it is installable with a provenance attestation after approval. Record in `notes.md` whether `prepublishOnly` and `prepare` ran during `npm stage publish` (the registry documentation does not say)
