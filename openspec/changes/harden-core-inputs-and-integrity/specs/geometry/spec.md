## ADDED Requirements

### Requirement: Non-finite bounds never reach the spatial index
The geometry scene is the derived set of node and connection bounds, hit shapes and paths that painting and picking query through a spatial index. The scene SHALL leave out (neither paint nor hit) a node or connection whose computed bounds are not finite, and the built-in spatial indexes SHALL refuse a non-finite box with a misuse error, so one bad entry can never hide the others from queries.

#### Scenario: A geometry that returns NaN bounds
- **WHEN** a host geometry returns NaN painted bounds for one node among others
- **THEN** that node is not in the scene and a rectangle query and a pick still find every other node

#### Scenario: Inserting a NaN box
- **WHEN** a caller inserts a box with a NaN coordinate into the AABB tree
- **THEN** a misuse error is raised and earlier entries are still found by queries

### Requirement: Enlarged index boxes shrink with their entries
The AABB tree stores each entry under a box enlarged by a margin, so small moves need no tree change. When an entry's new bounds are much smaller than its stored box (the stored box more than twice the width or height of a fresh enlarged box), the tree SHALL store a fitted box.

#### Scenario: A node resized from very large to small
- **WHEN** an entry's bounds change from 10,000 by 10,000 to 10 by 10 at the same centre
- **THEN** the stored box is the small bounds plus the margin

### Requirement: Geometry may declare content dependencies
A node geometry answers bounds, hit shape and port anchors from the node's record. A geometry SHALL be able to declare which content fields (`title`, `status`, `payload`, `capabilities`) its answers depend on, and the scene SHALL rebuild the node and its connections when one of those fields changes. Changes of undeclared content fields SHALL NOT rebuild the node's geometry.

#### Scenario: A geometry sized from the title
- **WHEN** a host geometry that declares `title` sizes the node from its title, and the title changes
- **THEN** the scene's node bounds follow the new title
