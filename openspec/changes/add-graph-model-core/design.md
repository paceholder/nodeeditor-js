# Design

## Context

`src/core/index.ts` only exports `FORMAT_VERSION`. Core is typechecked with `lib: ["ES2022"]`
and no `@types`, so DOM, `process` and Node globals are unavailable. See proposal.md for
motivation. Requirements: `openspec/specs/graph-model/spec.md`.

## Goals / Non-Goals

**Goals:**
- One set of record types and one read interface (`GraphReader`) shared by patches, commands,
  policy, snapshot, geometry and view.
- O(1) or O(degree) queries with deterministic result order.
- Immutable records, so a kept `GraphState` keeps showing old state after later commits.

**Non-Goals:**
- No public mutation API. `GraphStore` stays internal, and patches are the only public write
  path (next change).
- No persistent or HAMT data structures; copy-on-write at record level is enough.
- No view-local state such as selection, hover or viewport.

## Decisions

### Module layout (shared across Slice A core changes)

```
src/core/
  base/result.ts                 Result<T, E>, ok(), err(), Rejection, RejectionCode, MisuseError
  base/ids/ids.ts                branded NodeId/PortId/ConnectionId/…, IdKind, isWellFormedId
  base/ids/id-generator.ts       IdGenerator, IdCursor, createCounterIdGenerator()
  data/model/values.ts           Vec2, Size, QuarterTurns, isFiniteVec2/Size
  data/model/records.ts          NodeRecord, PortRecord, ConnectionRecord, Endpoint, PortDirection,
                                 AttachmentLimit, CapabilityOverrides, Payload (JSON-compatible)
  data/model/validate-records.ts structural checks per record → Result
  data/model/store.ts            GraphStore: ordered collections + seq + batch(); internal
  data/model/indexes.ts          attachment / incidence / neighbor indexes
  data/model/reader.ts           GraphReader interface + store-backed implementation
  data/model/state.ts            GraphState (read snapshot, cached per revision)
  data/model/freeze.ts           deepFreeze (records and snapshot arrays)
```

Folders are layers, lowest first: `base/` ← `data/` ← `edit/` ← `space/` and `io/` ← the
`graph-model.ts` facade. Later changes add `data/patch/` and `data/node-types/`, the editing
layer `edit/` (`events/`, `history/`, `adapter/`, `commands/`, `policy/`, `capabilities/`),
then `space/` and `io/`. Each file stays within 100–300 lines.

### Records

```ts
type PortDirection = "input" | "output" | "undirected";
type AttachmentLimit = number | "unlimited";            // integer >= 0
type QuarterTurns = 0 | 1 | 2 | 3;

interface NodeRecord {
  readonly id: NodeId; readonly type: string;
  readonly position: Vec2; readonly size: Size;          // world units
  readonly rotation: QuarterTurns; readonly mirrored: boolean;
  readonly z: number;                                    // paint order key
  readonly ports: readonly PortId[];                     // presentation order
  readonly title?: string; readonly status?: string;
  readonly payload: Payload;                             // JSON-compatible, opaque to the library
  readonly capabilities?: CapabilityOverrides;           // Partial<Record<Action, boolean>>
}
interface PortRecord {
  readonly id: PortId; readonly node: NodeId;
  readonly direction: PortDirection; readonly typeKey: string;
  readonly limit: AttachmentLimit; readonly label?: string;
  readonly placement?: PortPlacement;                    // node-local hint, refined by geometry
}
interface PortPlacement {                                // durable view data, unrotated body frame
  readonly x: number; readonly y: number;                // fractions of the body box, 0..1
  readonly normal?: Vec2;                                // optional outward direction
}
interface Endpoint { readonly node: NodeId; readonly port: PortId }
interface ConnectionRecord {
  readonly id: ConnectionId; readonly kind: string;      // "default" unless policy sets one
  readonly from: Endpoint; readonly to: Endpoint;        // unordered meaning when undirected
}
```

- Ports are their own records with document-unique IDs. The node owns their order through
  `NodeRecord.ports`. An endpoint names both node and port so validation can check that the
  port belongs to the node without a lookup chain.
- *Alternative considered:* ports embedded inside node records. Rejected because attachment
  indexes and per-port updates would then have to rewrite the whole node.
- Payloads are JSON-compatible `unknown`. Non-JSON payload codecs belong to the snapshot change.

### Identifiers

- `NodeId`, `PortId`, `ConnectionId` (and the reserved `GroupId`, `MemberKey`, `ValueId`) are
  branded strings. The library never parses or numerically orders IDs it did not mint.
- The generator contract is pure, so planning can allocate IDs without committing them:

  ```ts
  interface IdGenerator {
    next(kind: IdKind, cursor: IdCursor): { id: string; cursor: IdCursor };
    observe?(id: string, cursor: IdCursor): IdCursor;   // advance past an externally supplied ID
  }
  type IdCursor = Readonly<Record<string, number | string>>;   // JSON-compatible, opaque
  ```

- The default counter generator keeps one counter per kind (`n`, `p`, `c`, `g`). The document
  stores the cursor, and the cursor only ever moves forward: applying a patch advances it, and
  undo never rewinds it. That makes MOD-03a hold even across undo of a create.
- Externally supplied IDs (a hand-edited document) can be ahead of the cursor. The generator
  contract therefore has a pure `observe(id, cursor): IdCursor` that returns a cursor advanced
  past `id`, never moving backwards. The counter generator advances the counter of the ID's
  own prefix when the remainder is numeric and leaves the cursor unchanged otherwise. Host
  generators may omit `observe`, in which case callers use the cursor as-is (MOD-03a).
- *Alternative considered:* random UUIDs by default. Rejected: they are non-deterministic and
  hard to read in tests. Hosts can still plug them in.

### Store, ordering and batches

- `GraphStore` keeps `Map<Id, Entry>` per collection. Each entry holds the immutable record
  and a monotonically increasing `seq`, which fixes the collection order and survives
  remove/re-add with the same `seq` when undo restores it.
- Paint order is `(z, seq)` ascending, and the store tracks the current min/max `z` so
  "bring to front" is O(1). Port order is `NodeRecord.ports`. Query results sort by
  `seq`, never by Set or Map iteration (MOD-08).
- Mutation happens only inside `store.batch(fn)`. Indexes update within the batch, and the
  store's `revision` and cached `GraphState` are invalidated once, at the end of the batch.
  Whoever opens the batch (patch application) must only commit already-validated changes.
  The store itself does not roll back.

### Read snapshots

- `GraphReader` (`getNode`, `getPort`, `getConnection`, `nodes()`, `portsOf`,
  `connectionsOfNode`, `connectionsOfPort`, `neighbors`, `seqOf`, `revision`) is the interface
  used by everything downstream. `seqOf(id)` returns the internal insertion sequence of a node,
  port or connection (or `undefined` if absent). It is read-only and is needed because patch
  remove ops carry `seq` and snapshot diffing must read it.
- `GraphState` is a frozen object holding ordered arrays of record references. It is built
  lazily the first time it is requested for a revision, then cached. Records are never mutated
  in place; an update replaces the record object. So a kept state shows old data (MOD-13).
- Freezing: core has no reliable "dev build" signal. The option `freezeRecords` therefore
  defaults to `true`, and production hosts may pass `false`. This meets "frozen in development
  and test; production MAY skip".
- *Alternative considered:* deep copies on every read. Rejected as O(size) per read.

### Validation and errors

```ts
type Result<T, E = Rejection> = { ok: true; value: T } | { ok: false; error: E };
interface Rejection { code: RejectionCode; message: string; entities: readonly string[] }
```

`RejectionCode` is an exhaustive string union, extended by later changes. Structural codes are
`malformed-id`, `duplicate-id`, `non-finite`, `dangling-endpoint`, `port-node-mismatch`,
`invalid-limit` and `unknown-entity`. Validation never throws. `MisuseError` is thrown only for
programmer errors.

## Risks / Trade-offs

- **[Building `GraphState` is O(n)]** → It is built lazily, at most once per revision. Hot
  paths (view, policy) use `GraphReader` queries instead.
- **[Freezing costs CPU on every record replacement]** → It is opt-out per model, and only new
  or replaced records are frozen.
- **[The `z` key can drift into large or fractional values]** → Values are finite numbers, and
  renormalizing is an explicit command if it is ever needed. Ties are broken by `seq`.
- **[The cursor encodes generator-specific data]** → It is opaque JSON owned by the generator.
  The snapshot change persists it verbatim.
