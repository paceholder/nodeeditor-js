# serialization Specification

## Purpose

Defines the graph snapshot: one validated, plain-object, JSON-compatible shape of a graph
document. It is the input of snapshot-mode adapters, the clipboard fragment format, the
versioned local save/load format, and the shape of test fixtures.

## Requirements

### Requirement: One graph snapshot shape
The library SHALL define one plain-object, JSON-compatible graph snapshot shape holding a format version, ID high-water marks, ordered nodes with ordered ports, connections and assemblies, reference bindings, view geometry, groups, and persistent route constraints. It SHALL be used for snapshot-mode input, clipboard fragments, local save/load, and fixtures.

#### Scenario: Same shape everywhere
- **WHEN** a snapshot exported from a model is used as a clipboard fragment, saved as a file, and pushed through a snapshot-mode adapter
- **THEN** each path accepts it without conversion

#### Scenario: JSON round trip of the shape
- **WHEN** a snapshot is passed through JSON.stringify and JSON.parse
- **THEN** the result is deeply equal to the original snapshot

### Requirement: Shared snapshot validator
One validator SHALL check every incoming snapshot or fragment for structure, duplicate IDs, dangling endpoints, non-finite coordinates, unsupported format versions, and configured size limits, returning structured errors with code, message, and affected IDs.

#### Scenario: Duplicate ID detected
- **WHEN** a snapshot contains two nodes with the same ID
- **THEN** validation fails with a duplicate-ID error naming that ID

#### Scenario: Validator reused by snapshot mode
- **WHEN** a snapshot-mode adapter pushes a host snapshot with a dangling connection endpoint
- **THEN** the same validator rejects it and the read model keeps its previous state

### Requirement: Snapshot export and load
The model SHALL export its committed durable state as a snapshot and SHALL load a valid snapshot as a complete replacement of its document. Export SHALL NOT include pending or preview state.

#### Scenario: Export then load into fresh model
- **WHEN** a model's snapshot is loaded into a fresh model
- **THEN** both models answer every entity and adjacency query identically

### Requirement: Versioned local document format
The local document SHALL be saved and loaded as versioned JSON that wraps the graph snapshot, preserving stable IDs, node and port order, connections and assemblies, reference bindings, view geometry, groups, and persistent route constraints.

#### Scenario: Saved file declares its version
- **WHEN** a document is saved
- **THEN** the JSON contains the format version and the snapshot content

### Requirement: Payload codecs
Application payloads SHALL be preserved through typed serialization hooks. The default SHALL accept JSON-compatible payloads only; non-JSON values SHALL require an explicit codec or produce a clear rejection rather than silent data loss.

#### Scenario: Non-JSON payload without codec
- **WHEN** a node payload contains a Date or Map and no codec is registered for its type
- **THEN** save returns a rejection naming the node and field instead of dropping the value

#### Scenario: Registered codec
- **WHEN** a codec is registered for a payload type
- **THEN** save encodes and load decodes that payload through the codec

### Requirement: Excluded content
Standard serialized output SHALL exclude functions, executable source, DOM and GPU objects, caches, active gestures, and unconfirmed edits. Including viewport or selection SHALL be an explicit option.

#### Scenario: Save during a gesture
- **WHEN** a document is saved while a drag preview and a pending edit exist
- **THEN** the output contains only committed state and no viewport or selection

#### Scenario: Opt-in viewport
- **WHEN** save is called with the viewport option enabled
- **THEN** the output includes the viewport in a separate optional section

### Requirement: Validate before replace
An import SHALL be fully validated before the current document is replaced. Duplicate IDs, dangling endpoints, bad coordinates, unsupported format versions, and oversized input SHALL produce structured errors and leave the open document intact.

#### Scenario: Failed import keeps document
- **WHEN** an import fails validation
- **THEN** the current document, history, and selection are unchanged

### Requirement: Unknown types preserved
Structurally valid nodes or schemas of unregistered types SHALL load as diagnostic placeholders that keep their payloads opaque and unchanged. Unresolved extensions SHALL be reported distinctly from structurally invalid input, and unsupported format versions SHALL NOT be guessed.

#### Scenario: Placeholder round trip
- **WHEN** a document with a node of an unregistered type is loaded and saved again
- **THEN** the node's type key and payload are byte-for-byte identical in the new output

#### Scenario: Future format version
- **WHEN** a document declares a newer format version than the library supports
- **THEN** the load is rejected with an unsupported-version error

### Requirement: Deterministic round trip
Saving unchanged state SHALL produce identical output, including dynamic port IDs and manual route intent. Host-managed formats SHALL be supported through adapters that produce graph snapshots, without requiring a duplicate local document.

#### Scenario: Load-save is stable
- **WHEN** a saved document is loaded and saved again without edits
- **THEN** the two outputs are identical strings

### Requirement: Format migrations (SHOULD)
The library SHALL provide explicit format-migration hooks and fragment export options. Migrations SHALL return warnings and errors and SHALL NOT execute code supplied by the imported document.

#### Scenario: Migrate older version
- **WHEN** a document of a supported older version is loaded with a registered migration
- **THEN** it loads in the current format and the migration warnings are reported

### Requirement: No network access on open
Opening a document SHALL NOT contact a server. Asset references SHALL be explicit and resolved only through a host-configured resource provider.

#### Scenario: Asset URL in document
- **WHEN** a document containing asset references is loaded and no resource provider is configured
- **THEN** no network request is made and affected nodes show a missing-asset placeholder

### Requirement: Snapshot diff honours payload codecs
A payload codec converts a node type's application data to JSON and back. Diffing the model against a snapshot (computing the patch that turns one into the other) SHALL accept codecs: for a type with a codec the current payload SHALL be encoded and compared as JSON, and a codec failure SHALL be returned as an error. JSON equality SHALL report two different objects that are not plain objects or arrays (such as dates) as unequal.

#### Scenario: Diff of a model loaded with a date codec
- **WHEN** a model is loaded from a snapshot through a codec that decodes payloads into dates, and the model is diffed against the same snapshot with the same codecs
- **THEN** the patch holds no operation

#### Scenario: Two different dates
- **WHEN** JSON equality compares two date objects holding different times
- **THEN** it reports them unequal

### Requirement: Error lists are bounded
Validation of untrusted snapshots, documents and fragments SHALL report at most a configurable number of errors (default 100) and, when more were found, one more `limit-exceeded` error at the root path of the validated value (`graph` inside a document) giving the number left out.

#### Scenario: A hundred thousand malformed nodes
- **WHEN** a snapshot holds 100,000 node entries that are not valid nodes
- **THEN** validation fails with 101 errors, the last one saying how many were omitted

### Requirement: Document extras are validated as strictly as the graph
A document may carry a viewport (`x`, `y`, `zoom`) and a selection (IDs). Loading and saving SHALL reject a selection that lists an ID twice, a viewport with keys other than `x`, `y` and `zoom`, a viewport position outside plus or minus 1e7, and a zoom outside 0.001 to 1000.

#### Scenario: Duplicate selection and a tiny zoom
- **WHEN** a document's selection lists `n1` twice and its viewport zoom is 1e-300 with an extra key
- **THEN** loading fails with errors at `selection[1]`, at the viewport's extra key and at `viewport.zoom`

### Requirement: ID cursor keys are checked, not dropped
An ID cursor is the generator's persisted state: an object whose values are numbers or text. A snapshot ID cursor key named `__proto__` SHALL be reported as an error at its path rather than dropped.

#### Scenario: A prototype key in a snapshot cursor
- **WHEN** a snapshot's text holds the ID cursor `{"__proto__": 5}`
- **THEN** loading fails with an error at `idCursor.__proto__`

### Requirement: Loading never throws
Snapshot validation, snapshot load, document load and fragment parsing SHALL return errors instead of throwing when a host migration throws, a payload codec throws, or reading a property of the input object throws.

#### Scenario: A migration that throws
- **WHEN** a document at version 0 is loaded with a version-0 migration that throws
- **THEN** loading returns an error naming the failed migration and the model is unchanged

#### Scenario: An input with a throwing getter
- **WHEN** a snapshot object's `nodes` property is a getter that throws
- **THEN** validation returns an error instead of throwing

### Requirement: Groups in the snapshot
The graph snapshot SHALL list groups in document order, each with its ID, title, lock state and optional style key, and each node SHALL name the group it belongs to, if any. The shared validator SHALL reject, with a structural error giving the path, a node that names a missing group, a group that no node names, a duplicate group ID, and a group ID that collides with another entity's ID. Export followed by load SHALL reproduce groups, membership and group order exactly. The addition SHALL NOT change the format version: a document without groups SHALL be written exactly as before groups existed and SHALL stay readable by a library version that predates them, and a document saved before groups existed SHALL load unchanged. A clipboard fragment SHALL contain a group when the group is selected, together with all its members; on paste or duplicate the group SHALL get a new ID and its copied members SHALL belong to the copy. A copied node whose group is not part of the fragment SHALL be pasted as a free node. Comparing two snapshots SHALL report added, removed and changed groups and membership changes, so a host that pushes snapshots can change groups.

#### Scenario: Round trip with groups
- **WHEN** a model with two groups, one of them locked, is exported and the result is loaded into a new model
- **THEN** the new model has the same group IDs, titles, lock states, members and group order

#### Scenario: Node names a missing group
- **WHEN** an imported snapshot has a node whose group is an ID not present in the groups section
- **THEN** the import is rejected with a structural error whose path points at that node's group

#### Scenario: Document saved before groups existed
- **WHEN** a document saved before groups existed is loaded
- **THEN** it loads without error and has no groups

#### Scenario: Document without groups
- **WHEN** a model without groups is exported
- **THEN** the snapshot has no groups section, no node has a group field, and the format version is unchanged

#### Scenario: Copy a selected group
- **WHEN** a group with two members is selected, copied and pasted
- **THEN** a new group with a new ID holds two new nodes, the original group is unchanged, and the paste is one history entry

#### Scenario: Copy a member without its group
- **WHEN** one member node is selected without its group, copied and pasted
- **THEN** the pasted node belongs to no group

#### Scenario: Host pushes a snapshot with a new group
- **WHEN** a host in snapshot mode pushes a snapshot in which two existing nodes now name a new group
- **THEN** the model gains that group with those members and no local undo entry is added

### Requirement: Snapshot diff against the read model
The library SHALL compute, from a validated snapshot and the read model, the patch that turns the model into the snapshot, matching entities by ID. Equal entities SHALL produce no operation and a changed one a single update with old and new values. Removing a node SHALL remove its ports and connections in the same patch. The patch SHALL be deterministic and plain data.

#### Scenario: Equal snapshots give an empty patch
- **WHEN** a snapshot exported from a model is diffed against that same model
- **THEN** the patch has no operations

#### Scenario: Moved node gives one update
- **WHEN** a snapshot differs from the read model only in one node's position
- **THEN** the patch holds a single update of that node's position with its old and new value

#### Scenario: Removed node takes its connections
- **WHEN** a snapshot omits a node that has two connections
- **THEN** the patch removes both connections, the node's ports and the node, and applying it succeeds atomically

#### Scenario: Applying the patch reaches the snapshot
- **WHEN** the diff of a snapshot is applied to the read model and the model is exported
- **THEN** the export equals the snapshot in everything the snapshot defines, and the patch's inverse restores the previous export
