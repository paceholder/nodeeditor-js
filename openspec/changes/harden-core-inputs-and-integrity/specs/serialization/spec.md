## ADDED Requirements

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
