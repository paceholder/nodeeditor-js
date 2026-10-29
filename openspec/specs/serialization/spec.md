# serialization Specification

## Purpose

Defines the graph snapshot: one validated, plain-object, JSON-compatible shape of a graph
document. It is the input of snapshot-mode adapters, the clipboard fragment format, the
versioned local save/load format, and the shape of test fixtures.

## Requirements

### Requirement: SNP-01 One graph snapshot shape
The library SHALL define one plain-object, JSON-compatible graph snapshot shape holding a format version, ID high-water marks, ordered nodes with ordered ports, connections and assemblies, reference bindings, view geometry, groups, and persistent route constraints. It SHALL be used for snapshot-mode input, clipboard fragments, local save/load, and fixtures.

#### Scenario: Same shape everywhere
- **WHEN** a snapshot exported from a model is used as a clipboard fragment, saved as a file, and pushed through a snapshot-mode adapter
- **THEN** each path accepts it without conversion

#### Scenario: JSON round trip of the shape
- **WHEN** a snapshot is passed through JSON.stringify and JSON.parse
- **THEN** the result is deeply equal to the original snapshot

### Requirement: SNP-02 Shared snapshot validator
One validator SHALL check every incoming snapshot or fragment for structure, duplicate IDs, dangling endpoints, non-finite coordinates, unsupported format versions, and configured size limits, returning structured errors with code, message, and affected IDs.

#### Scenario: Duplicate ID detected
- **WHEN** a snapshot contains two nodes with the same ID
- **THEN** validation fails with a duplicate-ID error naming that ID

#### Scenario: Validator reused by snapshot mode
- **WHEN** a snapshot-mode adapter pushes a host snapshot with a dangling connection endpoint
- **THEN** the same validator rejects it and the read model keeps its previous state

### Requirement: SNP-03 Snapshot export and load
The model SHALL export its committed durable state as a snapshot and SHALL load a valid snapshot as a complete replacement of its document. Export SHALL NOT include pending or preview state.

#### Scenario: Export then load into fresh model
- **WHEN** a model's snapshot is loaded into a fresh model
- **THEN** both models answer every entity and adjacency query identically

### Requirement: SER-01 Versioned local document format
The local document SHALL be saved and loaded as versioned JSON that wraps the graph snapshot, preserving stable IDs, node and port order, connections and assemblies, reference bindings, view geometry, groups, and persistent route constraints.

#### Scenario: Saved file declares its version
- **WHEN** a document is saved
- **THEN** the JSON contains the format version and the snapshot content

### Requirement: SER-02 Payload codecs
Application payloads SHALL be preserved through typed serialization hooks. The default SHALL accept JSON-compatible payloads only; non-JSON values SHALL require an explicit codec or produce a clear rejection rather than silent data loss.

#### Scenario: Non-JSON payload without codec
- **WHEN** a node payload contains a Date or Map and no codec is registered for its type
- **THEN** save returns a rejection naming the node and field instead of dropping the value

#### Scenario: Registered codec
- **WHEN** a codec is registered for a payload type
- **THEN** save encodes and load decodes that payload through the codec

### Requirement: SER-03 Excluded content
Standard serialized output SHALL exclude functions, executable source, DOM and GPU objects, caches, active gestures, and unconfirmed edits. Including viewport or selection SHALL be an explicit option.

#### Scenario: Save during a gesture
- **WHEN** a document is saved while a drag preview and a pending edit exist
- **THEN** the output contains only committed state and no viewport or selection

#### Scenario: Opt-in viewport
- **WHEN** save is called with the viewport option enabled
- **THEN** the output includes the viewport in a separate optional section

### Requirement: SER-04 Validate before replace
An import SHALL be fully validated before the current document is replaced. Duplicate IDs, dangling endpoints, bad coordinates, unsupported format versions, and oversized input SHALL produce structured errors and leave the open document intact.

#### Scenario: Failed import keeps document
- **WHEN** an import fails validation
- **THEN** the current document, history, and selection are unchanged

### Requirement: SER-05 Unknown types preserved
Structurally valid nodes or schemas of unregistered types SHALL load as diagnostic placeholders that keep their payloads opaque and unchanged. Unresolved extensions SHALL be reported distinctly from structurally invalid input, and unsupported format versions SHALL NOT be guessed.

#### Scenario: Placeholder round trip
- **WHEN** a document with a node of an unregistered type is loaded and saved again
- **THEN** the node's type key and payload are byte-for-byte identical in the new output

#### Scenario: Future format version
- **WHEN** a document declares a newer format version than the library supports
- **THEN** the load is rejected with an unsupported-version error

### Requirement: SER-06 Deterministic round trip
Saving unchanged state SHALL produce identical output, including dynamic port IDs and manual route intent. Host-managed formats SHALL be supported through adapters that produce graph snapshots, without requiring a duplicate local document.

#### Scenario: Load-save is stable
- **WHEN** a saved document is loaded and saved again without edits
- **THEN** the two outputs are identical strings

### Requirement: SER-07 Format migrations (SHOULD)
The library SHALL provide explicit format-migration hooks and fragment export options. Migrations SHALL return warnings and errors and SHALL NOT execute code supplied by the imported document.

#### Scenario: Migrate older version
- **WHEN** a document of a supported older version is loaded with a registered migration
- **THEN** it loads in the current format and the migration warnings are reported

### Requirement: SER-08 No network access on open
Opening a document SHALL NOT contact a server. Asset references SHALL be explicit and resolved only through a host-configured resource provider.

#### Scenario: Asset URL in document
- **WHEN** a document containing asset references is loaded and no resource provider is configured
- **THEN** no network request is made and affected nodes show a missing-asset placeholder
