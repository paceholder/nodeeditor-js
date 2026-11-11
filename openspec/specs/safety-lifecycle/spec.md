# safety-lifecycle Specification

## Purpose

Defines how the library treats untrusted imported content, bounds failures of trusted
extensions, owns and releases per-instance resources, and keeps messages, motion, and
application-data editing explicit and localizable.

## Requirements

### Requirement: Untrusted imported content
Imported graph data, URLs, and markup SHALL be treated as untrusted. The library SHALL NOT execute document-provided scripts, handlers, or painter code. Built-in asset handling SHALL reject active or externally fetching SVG and HTML content unless an explicit host policy resolves it.

#### Scenario: Script inside SVG asset
- **WHEN** an imported SVG asset contains a script element or an event handler attribute
- **THEN** the built-in asset handler rejects it and the node shows a missing-asset diagnostic

#### Scenario: External reference inside SVG
- **WHEN** an SVG asset references an external image URL and no host policy allows it
- **THEN** no request is made and the asset is rejected

### Requirement: Trusted renderer registrations only
Custom JavaScript and React renderers SHALL be trusted host registrations. A document SHALL NOT cause code to be loaded; references to unregistered renderers SHALL fall back to diagnostics.

#### Scenario: Unknown painter key in document
- **WHEN** a document names a painter key that is not registered
- **THEN** the node renders as a diagnostic placeholder and no code is loaded

### Requirement: Limits and bounded failure
The library SHALL enforce configurable document, fragment, and resource limits. A thrown renderer error, rejected router request, or failed asset load SHALL yield a bounded error state for the affected entity, not an unhandled retry or render loop or a corrupted model.

#### Scenario: Painter throws
- **WHEN** a registered node painter throws on every call
- **THEN** that node shows an error state, other nodes keep rendering, the painter is not retried every frame, and the model is unchanged

#### Scenario: Oversized document
- **WHEN** a document exceeds the configured node limit
- **THEN** loading is rejected with a limit error

### Requirement: Trusted extension boundary documented
The documentation SHALL state that trusted synchronous callbacks (painters, policies, codecs) run as ordinary host code that the library cannot sandbox or preempt; catching their exceptions SHALL NOT be described as isolation.

#### Scenario: Documentation statement
- **WHEN** the extension documentation is reviewed
- **THEN** it states the trusted-extension boundary and the host's responsibility for callback cost

### Requirement: Per-instance disposal
Each editor instance SHALL own its lifecycle. Dispose SHALL release listeners, pointer capture, observers, workers, subscriptions, scheduled frames, and owned assets, and SHALL be safe to call more than once.

#### Scenario: Double dispose
- **WHEN** dispose is called twice on a view
- **THEN** the second call is a no-op and no error is raised

#### Scenario: Nothing scheduled after dispose
- **WHEN** a view is disposed while a redraw is scheduled
- **THEN** the scheduled frame is cancelled and no painting occurs afterwards

### Requirement: Suspend when hidden
A view SHALL stop unnecessary rendering while hidden or detached and SHALL resume with valid bounds. Reattaching SHALL NOT duplicate handlers or reuse invalid renderer resources.

#### Scenario: Hidden container
- **WHEN** the view's container becomes hidden while the model changes
- **THEN** no frames are painted until it is visible, and then one frame shows the current state

#### Scenario: Zero-size container
- **WHEN** the view is mounted into a zero-size container
- **THEN** it waits without errors and renders once the container has measurable size

### Requirement: Resource failure fallback
Missing fonts or assets, unavailable optional workers, container resize, and canvas context loss SHALL be handled by documented fallback or retry, or by a visible failure, with the document preserved.

#### Scenario: Canvas context lost
- **WHEN** the browser reports canvas context loss and later restoration
- **THEN** the view repaints from the read model after restoration and the document is unchanged

#### Scenario: Missing asset
- **WHEN** an image asset fails to load
- **THEN** the node renders a missing-asset placeholder with its bounds and ports intact

### Requirement: Localizable messages
Messages SHALL be localizable and host labels SHALL be supported without using translated strings as identifiers. Layout SHALL tolerate long and Unicode labels, including text edited through IME.

#### Scenario: Localized rejection message
- **WHEN** a host supplies translations and a connection is rejected
- **THEN** the shown message is translated while the rejection code stays the same

#### Scenario: Long Unicode label
- **WHEN** a node title contains 200 characters including combining marks and right-to-left text
- **THEN** the node renders without overflowing into other nodes and its hit shape is unchanged

### Requirement: Structured diagnostics
Diagnostics SHALL carry a code, severity, affected entity and member IDs, revision, and user-facing explanation. Local target rejections SHALL be distinguishable from whole-document validation errors.

#### Scenario: Diagnostic fields
- **WHEN** a document validation error is reported for a connection
- **THEN** the diagnostic includes code, severity, connection ID, revision, and message, and is marked as document-level

### Requirement: Reduced motion
Optional animation SHALL honor the reduced-motion preference. Animated decorations SHALL NOT conceal connection direction, selection, or errors.

#### Scenario: Reduced motion preferred
- **WHEN** the user agent reports a reduced-motion preference
- **THEN** optional animations are disabled and static indicators remain visible

### Requirement: Explicit application-data editing
Forms and property editors SHALL change application data only by submitting commands through the active adapter. The editor SHALL NOT interpret a displayed value, formatted label, or payload as an instruction to execute application code.

#### Scenario: Property edit goes through the adapter
- **WHEN** an inspector changes a node parameter
- **THEN** an update command is submitted to the adapter and the displayed value changes only after acceptance or as a marked pending preview

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
