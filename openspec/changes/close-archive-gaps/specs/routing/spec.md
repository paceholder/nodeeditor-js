## MODIFIED Requirements

### Requirement: Decorations without policy
Path painting SHALL support labels, arrowheads, dashed lines, multiple lanes, and diagnostic decorations without embedding connection policy in the painter. A path painter MAY place decorations, such as an end marker or tick, at either endpoint. Connection kinds that share a router MAY use different path painters (for example a double line and a single line). Expanded painted bounds SHALL participate in culling. Animated decorations are deferred (the reduced motion rule and the bounded dirty-driven work rule apply when they are added).

#### Scenario: Restyle a connection
- **WHEN** a connection is given a dashed style, an arrowhead, and a label
- **THEN** its bindings and policy outcome are unchanged and its painted bounds include the label and arrowhead

#### Scenario: Two kinds, one router
- **WHEN** two connection kinds use the same router and one is registered with a double-line painter and the other with a single-line painter
- **THEN** both follow identical routes, each is drawn in its own style, and neither registration touches policy, router, or picker
