# packaging Specification

## Purpose

Defines how the library is distributed: the @paceholder/nodeeditor-js package, its entry points and
peer dependencies, runtime independence from servers and frameworks, examples, the support
matrix, and deployment-friendly optional assets.

## Requirements

### Requirement: ESM package with typed entry points
The library SHALL be published as the MIT-licensed package `@paceholder/nodeeditor-js` containing ESM JavaScript, TypeScript declarations, and explicit exports for the core, view, view-advanced, and react entry points. The view entry point SHALL export what a host application uses to mount and customize an editor; engine building blocks SHALL be exported only from the view-advanced entry point. Each public name SHALL have exactly one entry point that exports it. Plain JavaScript users SHALL NOT need a TypeScript build step.

#### Scenario: Plain JavaScript import
- **WHEN** a plain JavaScript module imports `@paceholder/nodeeditor-js` and `@paceholder/nodeeditor-js/view` from a static page
- **THEN** both resolve without a build step and type declarations are available to TypeScript users

#### Scenario: Unexported path
- **WHEN** a consumer imports an internal path that is not listed in the package exports
- **THEN** module resolution fails

#### Scenario: One import path per name
- **WHEN** the export lists of all entry points are compared
- **THEN** no name is exported by more than one entry point, and the view entry point does not re-export core names

#### Scenario: Building blocks are separate
- **WHEN** a host mounts an editor with custom node painters, geometry, connection policy and tools
- **THEN** every import it needs comes from `@paceholder/nodeeditor-js` and `@paceholder/nodeeditor-js/view`, and none from `@paceholder/nodeeditor-js/view/advanced`

### Requirement: No required infrastructure
The library SHALL NOT require an application server, framework store, router, theme system, mandatory WASM, or startup network access. The minimal local example SHALL work from ordinary static hosting.

#### Scenario: Offline static example
- **WHEN** the minimal example is served from a local static file server with networking disabled
- **THEN** the editor loads and edits a graph

### Requirement: Headless core in Node
The core entry point SHALL be importable and testable in Node without DOM or browser globals. Browser-only setup SHALL occur only during explicit view mounting.

#### Scenario: Core typecheck without DOM
- **WHEN** the core sources are type-checked with only the ES2022 library and no DOM types
- **THEN** type checking succeeds

### Requirement: Examples
The package SHALL ship small complete examples for plain JavaScript, a React application shell, custom geometry and policy (including an image-symbol node with undirected typed ports), composite ports and references, and external-model and history integration.

#### Scenario: Examples run
- **WHEN** each example is built and opened in a supported browser
- **THEN** it loads without errors and demonstrates its feature

### Requirement: No global side effects
The library SHALL NOT apply global CSS resets, require fonts, bundle React, create application singletons, or resolve remote assets implicitly. Style injection or scoping and peer dependencies SHALL be documented.

#### Scenario: Host page styles untouched
- **WHEN** an editor is mounted on a page with its own styles
- **THEN** no style outside the editor container changes

### Requirement: Published support and versioning policy
Before R1 the project SHALL publish its tested support matrix (current and previous stable Chromium, Firefox, and Safari; React 19; ES2022; Node 20 or later), feature detection and fallbacks, license and dependency notices, bundle measurements, and API versioning policy.

#### Scenario: Matrix covered by CI
- **WHEN** the release checklist is evaluated
- **THEN** the browser tests run on each listed browser engine and the headless tests run on Node 20

### Requirement: Configurable optional assets
Optional workers, router, and renderer assets SHALL be explicitly configurable for bundlers, CSP, offline deployments, and embedded webviews. Ordinary editing SHALL NOT require shared-memory features.

#### Scenario: Worker unavailable
- **WHEN** the configured worker cannot be created under a restrictive CSP
- **THEN** the editor falls back to main-thread work and reports the fallback

#### Scenario: No cross-origin isolation
- **WHEN** the page is not cross-origin isolated
- **THEN** all editing features work

### Requirement: Tree-shakable features and default preset (SHOULD)
Optional features SHALL be tree-shakable, and a default preset SHALL provide usable basic tools without manual assembly.

#### Scenario: Unused router not bundled
- **WHEN** an application uses only straight connections and the default preset
- **THEN** the orthogonal router code is absent from its production bundle

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

### Requirement: Entries export only names a host needs
Each public entry point SHALL export only names a host needs to mount, configure or extend the editor, including the names for writing a custom geometry, router, painter, connection policy, tool or model adapter. A name only the library's own modules use, such as a low-level math helper, a finiteness predicate or an internal gesture step, SHALL NOT be exported. The number of exported names and of runtime values per entry SHALL NOT exceed a ceiling the repository states and checks.

#### Scenario: Removed internal name stays out
- **WHEN** the entries are built
- **THEN** none of the names recorded as removed internal helpers is exported by any entry

#### Scenario: Growth needs a decision
- **WHEN** a change adds an export so that an entry has more exported names than its stated ceiling
- **THEN** the repository tests fail until the ceiling is raised in the same change
