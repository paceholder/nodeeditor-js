# Host review: resolved decisions

Compact record of the questions settled between the host and the library. "The host" is the
application that embeds the editor; "the host backend" is the server that owns its document.
Open items are in `docs/host-spike-findings.md`; the current reply and plan are in
`docs/host-response.md`. The host's own requirement numbers are not repeated here;
rows are described in words.

## Facts about the host backend that shaped the answers

- The backend owns the document and every entity ID (server-issued UUIDs). A node is created
  together with its ports, so port IDs exist only after the answer and are fixed for the
  life of the node. The create call currently returns a wrapper ID, while reads use the inner
  component ID.
- Mutations run one at a time, but arrival order across connections is not guaranteed, so the
  host chains its own calls. Each mutation is followed by a change notification and a full
  re-read, and the read carries no revision, so a slow old answer can arrive late.
- Rotate and mirror are relative (a step, a toggle); move is absolute. Undo and redo live on
  the server and are project-wide.
- The previous editor had no conflict handling, so there is nothing to copy.

## Decisions

| Question | Decision | Where it lands (planned change and behaviour) |
| --- | --- | --- |
| Who issues entity IDs | By kind. Nodes and ports: the host, per instance, so no temporary ID and no alias map. Connections: the client, using host-supplied IDs, so a push holding the same ID gives an empty diff and selection survives. | Snapshot sync adapter: node, port and connection ID rules |
| Local node creation | Not forbidden. Creation stays one create-node command; for an adapter where the host names nodes it becomes a delegated intent with a pending result and a never-saved placeholder. The capability policy still lets a host make creation unavailable with a reason. | Snapshot sync adapter: delegated creation, placeholder, capability policy |
| Overlapping edits | Applied optimistically at once; handed to the host in commit order, one submission per gesture, without waiting for the previous answer. The host chains its calls. | Snapshot sync adapter: optimistic apply, submission in commit order |
| Edit intents | move, resize, rotate (absolute quarter turns), mirror (absolute flag), create node, delete, connect, disconnect, reconnect, each with old and new values; a multi-node move is one intent. | Snapshot sync adapter |
| Stale or reordered refreshes | `pushSnapshot(snapshot, revision?)` ignores a push older than the last applied one; the comparison is replaceable; a push without revision is always applied. | Snapshot sync adapter: older pushes ignored |
| Refresh versus pending edits | Confirmed state is kept as a copy; displayed state is that copy plus still-applicable pending edits. An edit whose target vanished is dropped, marked conflicted and reported by a `conflict` event. | Snapshot sync adapter: confirmed copy plus pending edits, conflict event |
| Refresh versus view state | A push is an incremental external change. Selection, viewport and history stay. A gesture continues unless the push removes or changes an entity it involves; then it is cancelled with a reason (`gesture-cancelled`) and commits nothing. | Snapshot sync adapter and async connection policy: pushes keep view state, gestures cancelled with a reason |
| Undo and redo | `history: "host"`: undo and redo call host functions, availability and labels come from the host, the library records nothing, built-in keys still run the commands. In local mode with a snapshot adapter, entries are dropped when the host rejects, and undo is refused while the newest edit is unanswered. | Snapshot sync adapter: host-owned history, local-mode rollback |
| Pending marker | Painters see an "unconfirmed" flag per entity; the library ships no visual treatment. | Snapshot sync adapter: unconfirmed flag |
| Asynchronous connection validity | A host validator `({ proposal, revision, signal }) => Promise<verdict>`; verdicts cached per connection plan and no duplicate request in one gesture; a verdict goes stale when a change touches the proposal's ports or their nodes (not on unrelated moves); structured rejections reach a `connection-rejected` event. No library default timeout. | Async connection policy (done): validator, verdict cache, rejection event |
| Selection origin | Every selection event carries `origin`: `user`, `api` or `model` (deleted-entity removals). Direct calls default to `api`. Unknown IDs in a programmatic selection are ignored and report no change. | Host integration checks: selection origin on events |
| Marquee | `marquee` option with `direction` (library default), `contain` and `intersect`; the host sets `intersect`. | existing marquee option |
| Keyboard | Shortcuts run only with editor focus or while a host predicate is true; the host can add bare keys and remove or rebind any built-in key; typing in a text field never runs a graph command. | Host integration checks: shortcut scoping and rebinding |
| Hover | Event with kind, ID and, for a node, its screen rectangle; the host keeps the delay. | React integration (merged): hover event |
| Anchored overlay | Placement around a node, kept aligned through pan, zoom and moves; wheel over attached content does not zoom. Node bodies stay canvas-painted; no React inside every node. | React integration (merged) |
| Fit, zoom, view lock | Controls panel, zoom limits, initial fit and view lock exist. | React integration (merged) |
| Reconnect by dragging a wire end | Opt-in (`reconnect: {}`), `onEmptyDrop` default `cancel`; a press on a selected wire's end grip reconnects unless Alt is held. | add-reconnect-tool |
| Docking | Mode `connect` (position unchanged, connection created), radius 40 px, Alt suppresses by default (now configurable), `onPendingRelease` default `move-only`, host sets `wait`. Compatibility comes only from the connection policy. | Docking change: connect mode, radius, suppress key, pending-release behaviour |
| Port normals | A port may carry an explicit outward normal, moved by rotation and mirror and honoured by the orthogonal router; without it the nearest edge is used. | Host integration checks: explicit port normals |
| Symbols from host assets | SVG data URIs of different sizes and tints, each tint under its own asset key; placement fractions in the picture's own coordinates. | Host integration checks: image symbols and tints |
| Connection and theme styling | Colour per connection kind, light and dark switched at run time through `setTheme`, no remount. | Host integration checks: per-kind colour, run-time theme switch |
| Pointer palette drop | Host converts pointer position with `clientToWorld`; no HTML5 drag and drop. | existing API |
| Packaging | Git dependency pinned to a tag, built on install; React 19 optional peer; ESM only; types shipped; package stays private until a registry decision. | add-consumable-package (new, see open items) |
| Host gap-analysis list (13 items) | All folded into the rows above or merged. Left as out of scope: React inside every node, domain connection rules (host policy), backend protocol, collaboration merging. Known limit: accessibility is reduced to keyboard shortcuts for select, move, delete and undo. | - |
| Benchmark | Reuse the existing comparison harness; sizes 50 to 500 typical, 2000 stress, until measured. | add-host-integration-checks |
