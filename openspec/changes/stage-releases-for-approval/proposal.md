# Proposal

## Why

The release workflow published a version straight to the npm registry: a pushed version tag
on `main` was enough to put a version live. The `release` environment is meant to hold the
job for a reviewer, but that is a repository setting the workflow cannot enforce, and it was
found without required reviewers when 0.2.0 was released. The registry now offers staged
publishing: a workflow submits a version, and it becomes installable only after a maintainer
approves it with two-factor authentication. The registry also recommends that a trusted
publisher is not allowed to publish directly.

## What Changes

- The last step of the release workflow runs `npm stage publish` instead of `npm publish`,
  with the same provenance, access and dist-tag flags.
- The pinned npm version rises from 11.5.1 to 11.21.2, because staged publishing needs
  11.15.0 or newer.
- The trusted publisher on npmjs.com allows neither `npm publish` nor `npm dist-tag`
  (an owner setting; the releasing guide says so).
- The releasing guide gains the approval step, the rejection of a staged version, and the
  note that the trusted publisher is changed only in a session with two-factor
  authentication.

Requirement refined: guarded release automation (the workflow stages, a maintainer approves).

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `packaging`: the release workflow stages a version for approval and never publishes
  directly.

## Out of scope

- Release 0.2.0, which went out through the earlier direct publish step.
- Required reviewers on the `release` environment and branch protection: still recommended
  in the guide, still set by the owner on GitHub.
