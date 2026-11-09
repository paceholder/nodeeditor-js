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
Before R1 the project SHALL publish its tested support matrix (current and previous stable Chromium, Firefox, and Safari; React 19; ES2022; Node 22 or later), feature detection and fallbacks, license and dependency notices, bundle measurements, and API versioning policy.

#### Scenario: Matrix covered by CI
- **WHEN** the release checklist is evaluated
- **THEN** the browser tests run on each listed browser engine and the headless tests run on Node 22

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
