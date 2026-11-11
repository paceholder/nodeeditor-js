## Why

The library is consumable from a git tag, but the owner has decided to publish it to the npm
registry as `@paceholder/nodeeditor-js`. The package is still marked private, nothing proves
that a published tarball holds only the built files, and there is no release automation.

## What Changes

- Package metadata: remove `private: true`, set public access, complete the registry fields
  and add a `prepublishOnly` guard.
- A node test that checks the `npm pack --dry-run` file list and the package metadata.
- CI: Node 20 and 22 for the checks, plus a consumer smoke job.
- A release workflow that publishes with provenance through npm trusted publishing when a
  version tag is pushed, after checking that the tag equals the package version.
- A release guide for the owner; install guide and README name the registry install.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `packaging`: a new "Published package" requirement (a MUST with linked evidence).

## Impact

- `package.json`, `.github/workflows/`, a new test under `scripts/`, `docs/guide-releasing.md`,
  `docs/guide-installing.md`, `README.md`.
- Supersedes the decision in `add-consumable-package` to keep `private: true` until a registry
  decision.

## Out of Scope

- Pushing tags or publishing: the owner does both.
- Browser tests in CI (see design).
