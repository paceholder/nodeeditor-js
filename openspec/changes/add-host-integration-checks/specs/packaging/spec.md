## ADDED Requirements

### Requirement: PKG-09 Consumable build
The built `dist/` output SHALL install and build in a fresh consumer project that uses a
current Vite and TypeScript, with React 19 as an optional peer dependency and no import-time
side effects. The consumption path (local link or packed tarball, and registry status) SHALL be
documented (PKG-01, PKG-05, PKG-06).

#### Scenario: Packed tarball
- **WHEN** `npm pack` output is installed in a fresh project and imports every entry point
- **THEN** `vite build` and `tsc --noEmit` succeed and the bundle contains no unused entry points

#### Scenario: Missing React
- **WHEN** the consumer imports only core and view without React installed
- **THEN** installation and build succeed

### Requirement: PKG-10 External drop example and coordinate conversion
`view.clientToWorld` SHALL be correct when the view sits in a scrolled, CSS-transformed or
scaled container. One example SHALL create a node at the pointer-up position of a drag that
starts outside the view, using pointer events only and no HTML5 drag and drop (PKG-04).

#### Scenario: Transformed container
- **WHEN** the view is inside a scrolled container scaled by 0.5 and a point is converted
- **THEN** the world position matches the node painted under that point

#### Scenario: Palette drop
- **WHEN** a pointer drag from a palette item ends over the canvas
- **THEN** one node is created at the converted position as one history entry, and a release outside the canvas creates none
