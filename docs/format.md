# Document and snapshot format

This document describes the files and objects that carry a graph outside the live model:
the **graph snapshot** (a plain object) and the **document** (versioned JSON text that
wraps a snapshot). Requirements: SNP-01 to SNP-03 and SER-01 to SER-08 in
`openspec/specs/serialization/`. Code lives in `src/core/io/snapshot/`.

One snapshot shape serves local save and load, test and benchmark fixtures, clipboard
fragments, and (later) snapshot-mode adapters. Every incoming snapshot goes through the
same validator.

## 1. Graph snapshot

```json
{
  "format": "nodeeditor-js/graph",
  "version": 1,
  "idCursor": { "c": 1, "n": 2, "p": 3 },
  "nodes": [
    {
      "id": "n1",
      "type": "pipe",
      "position": { "x": 0, "y": 0 },
      "size": { "width": 40, "height": 20 },
      "title": "Inlet",
      "ports": [
        { "id": "p1", "direction": "undirected", "typeKey": "hydraulic" },
        { "id": "p2", "direction": "undirected", "typeKey": "hydraulic" }
      ],
      "payload": { "length": 2 }
    }
  ],
  "connections": [
    { "id": "c1", "from": { "node": "n1", "port": "p2" }, "to": { "node": "n2", "port": "p3" } }
  ]
}
```

Entries mirror the model records (`NodeRecord`, `PortRecord`, `ConnectionRecord`) field
for field. Two differences: ports are embedded in their node (in presentation order) and
do not repeat their `node` field.

| Entry | Required | Optional (omitted when equal to the default) |
| --- | --- | --- |
| snapshot | `format`, `version`, `nodes`, `connections` | `idCursor`; reserved `assemblies`, `references`, `groups`, `routes` |
| node | `id`, `type`, `position`, `size`, `ports`, `payload` | `rotation` (0), `mirrored` (false), `z` (0), `title`, `status`, `capabilities` |
| port | `id`, `direction`, `typeKey` | `limit` ("unlimited"), `label`, `placement` |
| connection | `id`, `from`, `to` | `kind` ("default") |

Rules:

- IDs are opaque non-empty strings without whitespace. They are unique across all entity
  kinds in one snapshot.
- `rotation` is a clockwise quarter turn count 0 to 3. Coordinates and sizes are finite
  numbers; sizes are not negative. `limit` is an integer of 0 or more, or `"unlimited"`.
- `payload` is application data. It must be plain JSON (see section 5). Use `null` for none.
- Unknown fields are rejected, not dropped, so no data is silently lost.
- The reserved sections must be absent or empty. A non-empty one fails with
  `unsupported-section` until its capability exists.
- Load fills the defaults back in; export omits them.

### Ordering

Order is explicit in arrays and never depends on object key order (MOD-08).

- `nodes`: paint order, `(z, insertion sequence)` ascending. The last node is painted on
  top. Loading assigns insertion sequence in array order, so a loaded model paints and
  lists nodes in snapshot order.
- `ports` inside a node: the node's presentation order.
- `connections`: collection order.
- Object keys are written in a fixed order, so equal state gives byte-identical JSON text
  (SER-06). The ID cursor keys are written sorted.

### ID high-water marks

`idCursor` is the ID generator's state, copied from the model on export. The default
generator keeps one counter per kind (`n`, `p`, `c`, ...), so a deleted `n7` is never
handed out again after save and load (MOD-03a). On load the cursor becomes the
snapshot's cursor and is then advanced past every ID found in the snapshot (through the
generator's `observe`), so a hand-edited file with a node `n12` and a cursor at 9 still
cannot cause reuse. A custom generator without `observe` has its cursor used as-is.

### Fragments

A fragment is a snapshot without `idCursor` whose connections reference only nodes
inside it. Pass `fragment: true` to `validateSnapshot`, or `exportSnapshot(model,
{ fragment: true })`. Paste semantics (ID remapping, external references) are a later
change.

## 2. Document

```json
{ "format": "nodeeditor-js/document", "version": 1, "graph": { "...": "snapshot" },
  "viewport": { "x": 0, "y": 0, "zoom": 1 }, "selection": ["n1"] }
```

- `saveDocument(model, options)` returns the JSON text. Standard output holds only
  committed durable state. Functions, caches, previews and pending edits are never part
  of it.
- `viewport` and `selection` are written only when the caller passes them. On load they
  are validated (finite numbers, positive zoom, selected IDs exist in the graph) and
  returned in the report; the model never stores them.
- `loadDocument(model, text, options)` checks the text length, parses, checks format
  and version, validates the whole graph, and only then replaces the document. It
  performs no network or file access. Asset references stay plain strings in payloads;
  resolving them is the job of a host-configured resource provider.
- Output is compact by default (`indent` is optional). Loading and saving an unchanged
  document gives an identical string.

## 3. Loading

`loadSnapshot` and `loadDocument` replace the whole document in one step: the model's
contents, the ID cursor and local history are replaced, and one `reset` event is
emitted. This is not an undoable edit. On any error nothing changes and no event fires
(SER-04). Nodes of unregistered types load unchanged, keep their payload opaque, and are
reported as `unresolved-type` diagnostics, separately from validation errors (SER-05).

## 4. Errors

Every error has a `code`, a `message`, the JSON `path` of the offending value
(`nodes[3].ports[1].id`, `""` for the root), and the affected `entities` (IDs). The
validator collects all errors it finds, sorted by path. In documents, graph errors have
the prefix `graph`.

| Code | Meaning |
| --- | --- |
| `invalid-shape` | Wrong type, missing field, unknown field, bad JSON text |
| `unsupported-format` | The `format` tag is not the expected one |
| `unsupported-version` | The version is newer than (or unknown to) this library; never guessed |
| `unsupported-section` | A reserved section is non-empty |
| `non-json-payload` | A payload holds a value that is not plain JSON (Date, Map, undefined, function, NaN, cycle, class instance) |
| `limit-exceeded` | A size limit was exceeded |
| `malformed-id` | An ID is empty or contains whitespace |
| `malformed-record` | A record field is out of range (for example rotation) |
| `duplicate-id` | Two entities share an ID |
| `non-finite` | A coordinate, size or z is not a finite number |
| `dangling-endpoint` | A connection names a node or port that does not exist |
| `dangling-reference` | A selection entry names an ID that does not exist |
| `port-node-mismatch` | A connection endpoint names a port that belongs to another node |
| `invalid-limit` | A port limit is not an integer of 0 or more, or `"unlimited"` |

The same codes appear in `SNAPSHOT_ERROR_CODES`. Duplicate codec registration reports
`duplicate-type`.

## 5. Payloads and codecs

By default a payload must be plain JSON data. A node type whose payload holds other
values registers a `PayloadCodec` (`encode` to JSON, `decode` back) in a
`PayloadCodecRegistry` passed to `saveDocument` and `loadDocument`/`loadSnapshot`.
Without a codec, save fails with `non-json-payload`, naming the node and the field path;
nothing is dropped. Codecs are host code and are never taken from a document.

## 6. Limits

`SnapshotLimits`, all lowerable per call:

| Limit | Default |
| --- | --- |
| `maxNodes` | 100 000 |
| `maxConnections` | 200 000 |
| `maxPortsPerNode` | 1 024 |
| `maxPayloadDepth` | 64 |
| `maxDocumentChars` | 64 Mi (text length, checked before parsing) |

## 7. Migrations

Older document versions can be upgraded by host-supplied functions
(`migrations: { [fromVersion]: (doc) => Result<{ doc, warnings }> }`), applied one
version at a time. None ship yet. Without a matching migration, an older or newer
version fails with `unsupported-version`. A migration is code the host passes in; code or
expressions inside a document are never executed.

## 8. Snapshot diff

`diffSnapshot(reader, target)` returns the patch that turns the current model into a
validated target snapshot: removes (connections, ports, nodes), then adds, then field
updates, then in-place connection endpoint updates (connections keep their ID). Equal
state gives an empty patch. New entities receive fresh insertion sequence numbers when
the patch is applied. Snapshot-mode adapters will build on this.
