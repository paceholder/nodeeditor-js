## ADDED Requirements

### Requirement: Published package
The library SHALL be publishable to the npm registry as the scoped package `@paceholder/nodeeditor-js` with public access. The package SHALL NOT be marked private. The published tarball SHALL contain only the built `dist/` output, `package.json`, `README.md` and `LICENSE`, and SHALL NOT contain sources, tests, examples, documentation or scripts. Its `version` SHALL equal the release tag name, and the automated release SHALL refuse to publish when they differ and SHALL publish with a provenance attestation. The release procedure SHALL be documented.

#### Scenario: Tarball contents
- **WHEN** the file list of `npm pack --dry-run` is read
- **THEN** every file is under `dist/` or is `package.json`, `README.md` or `LICENSE`

#### Scenario: Public scoped metadata
- **WHEN** `package.json` is read
- **THEN** the name is `@paceholder/nodeeditor-js`, `private` is absent and `publishConfig.access` is `public`

#### Scenario: Tag differs from version
- **WHEN** a release is triggered by a tag whose name differs from the package version
- **THEN** the release fails before publishing
