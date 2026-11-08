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

#### Scenario: Missing React
- **WHEN** the consumer imports only core and view without React installed
- **THEN** installation and build succeed

### Requirement: External drop example and coordinate conversion
`view.clientToWorld` SHALL be correct when the view sits in a scrolled, CSS-transformed or
scaled container. One example SHALL create a node at the pointer-up position of a drag that
starts outside the view, using pointer events only and no HTML5 drag and drop.

#### Scenario: Transformed container
- **WHEN** the view is inside a scrolled container scaled by 0.5 and a point is converted
- **THEN** the world position matches the node painted under that point

#### Scenario: Palette drop
- **WHEN** a pointer drag from a palette item ends over the canvas
- **THEN** one node is created at the converted position as one history entry, and a release outside the canvas creates none
