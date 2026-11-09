## ADDED Requirements

### Requirement: Bounded SVG intrinsic size
An SVG asset's intrinsic size is read from its `width` and `height` attributes or its `viewBox`. The view SHALL scale that size down, keeping its aspect ratio, so its longer side is at most 4096 pixels. An SVG source SHALL count against the asset budget by its text length, two bytes per character. No rasterized bitmap SHALL have a side longer than 4096 pixels, whatever the source.

#### Scenario: Huge declared size
- **WHEN** an SVG declares a width and height of 30 000
- **THEN** its intrinsic size is 4096 by 4096, its source counts by its text length, and other cached assets are not evicted because of it

#### Scenario: Large raster
- **WHEN** a raster picture 40 000 pixels wide is drawn at any zoom
- **THEN** no bitmap wider than 4096 pixels is requested

### Requirement: SVG blobs screened by media-type prefix
A host-supplied blob SHALL be screened as SVG when its media type starts with `image/svg+xml`, ignoring case and any parameters. The screen SHALL reject `set` and `animate` elements that target a link attribute. SVG SHALL be decoded only through an image element, which runs no script and fetches nothing, and the documentation SHALL name that as the isolation the screen adds to.

#### Scenario: Media type with parameters
- **WHEN** the resolver returns a blob of type `image/svg+xml;charset=utf-8` that holds a script element
- **THEN** the asset fails as unsafe

#### Scenario: Animated link
- **WHEN** an SVG holds a `set` element whose attribute name is `href`
- **THEN** the screen rejects it

### Requirement: Immutable exported constants
Every constant object or array exported by the view entry points SHALL be frozen, including nested objects and arrays, so one view or host cannot change another's defaults.

#### Scenario: Changing the default theme
- **WHEN** a host assigns a new background color to the exported default theme
- **THEN** the assignment fails and views keep the original default

### Requirement: Independent change subscriptions
Every subscription the view offers SHALL be independent per call: subscribing one handler twice SHALL deliver each notification twice, and each returned unsubscribe function SHALL remove only its own subscription.

#### Scenario: One handler subscribed twice
- **WHEN** a host subscribes one handler twice to a painter registry and calls the first unsubscribe
- **THEN** the handler is still called once per later registration change
