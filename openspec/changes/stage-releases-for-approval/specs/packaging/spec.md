## MODIFIED Requirements

### Requirement: Guarded release automation
The release workflow SHALL run in a protected `release` environment, SHALL refuse to publish when the tagged commit is not on the `main` branch, SHALL reference every third-party action by full commit identifier with the version in a comment, SHALL install an exact npm version, and SHALL stage a version with a pre-release part under the `next` distribution tag. The release workflow SHALL only stage a version on the registry, which means submitting it so that nobody can install it until a maintainer approves it with two-factor authentication, and SHALL NOT publish a version directly. The check workflow SHALL grant only read access to repository contents.

#### Scenario: Pre-release tag
- **WHEN** the package version is `1.0.0-rc.1`
- **THEN** the staging command passes `--tag next`

#### Scenario: Staged, not published
- **WHEN** the release workflow has passed its checks for a pushed version tag
- **THEN** it runs `npm stage publish`, no step runs `npm publish`, and the version is installable only after a maintainer approves it
