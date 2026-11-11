## ADDED Requirements

### Requirement: README tells a newcomer how to start
The README that ships in the package SHALL show a short example that creates a model and mounts a view, a short React example, a stability statement, the line "ESM only, Node 20+, evergreen browsers", and a note that TypeScript needs `moduleResolution` set to `bundler`, `node16` or `nodenext`.

#### Scenario: Required content
- **WHEN** the README is read
- **THEN** it contains a core-and-view example, a React example, the support line and the module resolution note

### Requirement: README makes only true, resolvable statements
The README SHALL link to documentation only by absolute address, SHALL NOT present contributor commands as the quick start, SHALL NOT claim availability that is not true, and SHALL NOT name a demo address that does not exist.

#### Scenario: Links resolve outside the repository
- **WHEN** the README is read on a page that is not inside the repository checkout
- **THEN** every link to documentation is an absolute address

### Requirement: Client directive on the React entry
The built React entry point SHALL begin with the `"use client"` directive so that a server-component framework treats it as client code, and no other built entry point SHALL carry the directive.

#### Scenario: First line of the built files
- **WHEN** the first line of each built entry file is read
- **THEN** the React entry's is `"use client";` and the others' are not

### Requirement: Guarded release automation
The release workflow SHALL run in a protected `release` environment, SHALL refuse to publish when the tagged commit is not on the `main` branch, SHALL reference every third-party action by full commit identifier with the version in a comment, SHALL install an exact npm version, and SHALL publish a version with a pre-release part under the `next` distribution tag. The check workflow SHALL grant only read access to repository contents.

#### Scenario: Pre-release tag
- **WHEN** the package version is `1.0.0-rc.1`
- **THEN** the publish command passes `--tag next`

### Requirement: Project policy files
The repository SHALL contain a changelog, a security policy that says how to report a vulnerability, and contribution instructions, and none of these three files SHALL be shipped in the published package. The package manifest SHALL name an author and the address of the public repository, and SHALL list `@types/react` as an optional peer dependency.

#### Scenario: Optional type peer
- **WHEN** `package.json` is read
- **THEN** `@types/react` is a peer dependency marked optional

### Requirement: One source-map reference per built file
Each built JavaScript file SHALL end with at most one source-map comment.

#### Scenario: Duplicate comment
- **WHEN** the last lines of every built JavaScript file are read
- **THEN** none contains two source-map comments
