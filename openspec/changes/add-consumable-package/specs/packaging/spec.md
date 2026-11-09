## ADDED Requirements

### Requirement: Consumable build
The built `dist/` output SHALL install and build in a fresh consumer project that uses a
current Vite and TypeScript, with React 19 as an optional peer dependency and no import-time
side effects. The package SHALL be ESM only and ship its type declarations. A dependency on the
git repository, pinned to a tag or commit, SHALL produce a working `dist/` through a build step
that runs at install time, with the build tools available at that time; this matters for hosts
that build in containers and CI, where a sibling folder does not exist. The consumption path (git dependency, packed tarball,
registry status) SHALL be documented.

#### Scenario: Packed tarball
- **WHEN** `npm pack` output is installed in a fresh project and imports every entry point
- **THEN** `vite build` and `tsc --noEmit` succeed, and a bundle that imports only the core entry point contains no code from the view or react entry points

#### Scenario: Git install
- **WHEN** a fresh empty project installs the library from a git URL pinned to a commit and imports the core, view, view-advanced and react entry points
- **THEN** every import resolves to built files with types, with no manual build step

#### Scenario: The consumer bundle contains exactly one React copy
- **WHEN** a consumer project that depends on the library and on React 19 is bundled with Vite, including when the library is linked from a folder instead of installed
- **THEN** the bundle contains exactly one copy of React, the one the consumer's own components use, because React is a peer dependency of the library and is never bundled into `dist/`

#### Scenario: Missing React
- **WHEN** the consumer imports only core and view without React installed
- **THEN** installation and build succeed
