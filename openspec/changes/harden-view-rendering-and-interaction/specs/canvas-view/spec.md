## ADDED Requirements

### Requirement: Painter failures stay contained
A painter is a function the view calls to draw one entity or layer (node, connection, port glyph, background or interaction painter). When a painter throws, the view SHALL restore the canvas state from before the call, SHALL paint the rest of the frame, and SHALL start every later layer paint from a reset canvas state.

#### Scenario: A clipping painter throws once
- **WHEN** a node painter clips the canvas to its node and then throws during one frame
- **THEN** the other visible nodes are painted in that frame and in every later frame, outside that clip

#### Scenario: A throwing layer does not stop the frame
- **WHEN** the scene layer throws during a frame in which the interaction layer is also due
- **THEN** the interaction layer is still painted in that frame

### Requirement: Painter errors are reported
The view SHALL report an error caught from a painter through a `paint-error` view event carrying the layer name and the error, at most once per layer per frame, and SHALL rethrow the error asynchronously when no listener is registered.

#### Scenario: Throwing node painter with a listener
- **WHEN** a node painter throws for two nodes in one frame and a `paint-error` listener is registered
- **THEN** the listener is called once for the scene layer with the first error

### Requirement: Asset cache keeps the visible set
The asset cache holds bitmaps of host pictures under a byte budget. A bitmap drawn or stored since the last painted frame is pinned and SHALL NOT be evicted. Evicting an asset's last bitmap SHALL keep its decoded source, so a later draw SHALL NOT call the resolver. Still over budget, the cache SHALL release whole assets not drawn in the current frame, least recently drawn first.

#### Scenario: Visible pictures exceed the budget
- **WHEN** eight 512 by 512 pictures stay visible for 120 frames under a 4 MiB budget
- **THEN** the resolver is called eight times and each picture is rasterized once

#### Scenario: An evicted bitmap is drawn again
- **WHEN** an asset's only bitmap was evicted to make room and the asset is drawn again
- **THEN** it is rasterized again from its kept source without a new resolver call

### Requirement: Over-budget visible set is reported
When the pinned bitmaps and the sources of the assets drawn in the current frame alone exceed the asset budget, the cache SHALL keep them, exceeding the budget, and SHALL report in its statistics that it is over budget and how many bytes the frame pins.

#### Scenario: Budget too small for the frame
- **WHEN** the pictures one frame draws need 8 MiB of bitmaps under a 4 MiB budget
- **THEN** the statistics report over budget with at least 8 MiB pinned, and nothing the frame drew is evicted

### Requirement: Asset invalidation
The view SHALL let the host invalidate one asset by reference, or every asset: their cached bitmaps and decoded sources SHALL be released, their failure state cleared, the scene repainted, and the next draw SHALL ask the host resolver again. A rasterization that fails SHALL also release every other cached size of that asset.

#### Scenario: Swapping a symbol library
- **WHEN** a ready asset is invalidated after the host changed what its resolver returns for it
- **THEN** the next frame calls the resolver again and the new picture is drawn

#### Scenario: Failed rasterization
- **WHEN** rasterizing one size of an asset fails while another size is cached
- **THEN** the asset reads as failed and none of its sizes stays in the cache

### Requirement: Resize without a blank frame
When the view's container changes size, the view SHALL repaint every layer before the browser presents the next frame, so no frame shows the cleared canvases.

#### Scenario: Container resized
- **WHEN** the container grows and no animation frame runs before the browser paints
- **THEN** the background and scene canvases already show the content at the new size

### Requirement: Device-pixel backing store
Each canvas's backing store SHALL take the exact device-pixel size of the container where the browser reports it, and otherwise the CSS size times the device pixel ratio, rounded. The backing area of a canvas SHALL NOT exceed 16 777 216 pixels; above that the view SHALL lower the effective pixel ratio so the area fits and SHALL paint with that ratio.

#### Scenario: Fractional pixel ratio
- **WHEN** the browser reports a device-pixel box that differs from the rounded CSS size times the ratio
- **THEN** the backing store takes the device-pixel box

#### Scenario: Very large container
- **WHEN** a 10 000 by 10 000 CSS-pixel container is shown at pixel ratio 2
- **THEN** each canvas's backing area is at most 16 777 216 pixels and the reported pixel ratio is lowered to match

### Requirement: Grid lines on device pixels
The built-in background grid SHALL place each one-device-pixel line on the center of a device pixel at every pixel ratio.

#### Scenario: Pixel ratio 1.5
- **WHEN** the grid is drawn at a pixel ratio of 1.5
- **THEN** every line's device coordinate is an integer plus one half

### Requirement: Hover repaint on request
A change of the hovered entity SHALL repaint the scene layer only when the node entering or leaving hover is drawn by a node painter that declares it repaints on hover. Painters SHALL always receive the current hover state when the scene paints.

#### Scenario: No painter uses hover
- **WHEN** the pointer moves from one node to another and no node painter declares it repaints on hover
- **THEN** the scene layer is not repainted

#### Scenario: A painter asks for hover
- **WHEN** the pointer enters a node whose painter declares it repaints on hover
- **THEN** the scene repaints and that painter sees the node as hovered
