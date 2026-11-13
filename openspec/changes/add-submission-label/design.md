# Design

## Context

- `decodeIntents(submission, reader)` (`src/core/edit/intents/decode.ts`) returns a list of
  `Intent` values: move, resize, rotate, mirror, create-node, delete, connect, disconnect,
  reconnect and the catch-all `other`. One gesture is one submission, so the list is short.
- A `Submission` carries a `label` string built by the library for its local history
  (for example `Create <type label>`). It is English text and stays as it is.
- Core must stay headless and free of display text; entities are addressed by IDs.

## Decisions

### D1. Describe intents, not submissions

The function takes the decoded intents (`readonly Intent[]`), not a submission. It then needs
no reader, no patch and no knowledge of how decoding works, and a host that has already
decoded to map store calls passes the same list. Name: `describeIntents`.

### D2. One entry per intent, in the same order

The result is `readonly IntentLabel[]`. A host that wants one label for the step takes the
first entry or joins them its own way. The library does not choose, because the right
wording for "delete plus an unrelated connect" is the host's.

### D3. An entry is a kind and counts

`IntentLabel` is `{ kind: IntentKind; count: number; connections?: number }`.

| Intent kind | `count` | `connections` |
| --- | --- | --- |
| move, resize, rotate, mirror | nodes listed | absent |
| create-node | 1 | absent |
| delete | nodes removed | connections removed with them |
| connect, disconnect, reconnect | 1 | absent |
| other | operations listed | absent |

`kind` reuses `IntentKind`, so a new intent kind is a compile error until the function
handles it (exhaustive `switch`). No node type, title or ID is included: a host that wants
"Delete resistor R1" reads the intent itself.

### D4. Not included

- No English or other display text, and no formatting helper.
- No label for undo or redo: the submission already carries its `origin`.
- No combined "summary of the whole submission" entry.

## Risks

- A host may want more than a count (for example the type of the moved node). It keeps
  `decodeIntents` for that; this function stays the cheap common case.
