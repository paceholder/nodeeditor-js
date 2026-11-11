# Library reply to the host

Short reply after the host review, the host answers and the two spike rounds. Details are in
`docs/host-review-notes.md` (resolved decisions) and `docs/host-spike-findings.md` (open
items, host duties, spike requests).

## What is available now

The React integration is merged and runnable with `npm run demo:react` (see
`docs/guide-react.md`): mount component, hooks for selection, viewport, hover, one node or
connection, command availability and history, a generic event hook, an anchored overlay, a
controls panel, view lock, zoom limits and initial fit. Route editing for orthogonal
connections is merged. The asynchronous connection policy is done: a host validator, a
verdict cache, and `connection-rejected` and `gesture-cancelled` events.

## What we decided from your answers

- Many connections per port: left to your capacity policy; the library assumes nothing.
- Paste and duplicate: supported, not used by you at first. Answer "not supported" and the
  editor shows the reason.
- Departures from your earlier answers (delegated creation instead of forbidding it, three
  selection origins, opt-in reconnect, `intersect` marquee option) were accepted in your
  reply.
- Snapping, the docking modifier, the creation timeout and the spike requests are covered
  per change below.

## Reply to the second spike round

Thank you for the measurements and the read-only editor.

- **Install and private registry.** The library will be published to the public npm
  registry as `@paceholder/nodeeditor-js`, first version 0.1.0. The library owner publishes it
  by hand first; after that you run `npm install @paceholder/nodeeditor-js@0.1.0` with no
  build step and no development tools. Question: does your registry proxy or mirror public
  npm packages, or is it private-only? If private-only, we offer a packed tarball. The
  git-tag route also exists, but it builds on install and needs tsup, typescript, esbuild
  (platform binaries) and type packages for node and react, so we do not recommend it behind
  a private registry. It is not published yet; keep the sibling link until we announce it.
- **Node 20.** Supported, tested on Node 20 and 22 in CI. The `engines` warning came from an
  older checkout.
- **Single React copy.** The setting is needed only with the sibling link. With the installed
  package you can drop it, provided your package manager installs React once.
- **Dashed wire per connection kind.** Planned as a theme override, with the last change
  below. Until then keep passing a dash to the default painter.
- **Colour strings silently ignored.** Acknowledged. An optional development-time warning is
  under consideration; not promised.
- **Theme switching at run time.** Thanks; this is the intended behaviour.
- **Measurements.** Accepted as indicative; the planning budgets stay. Once the adapter
  exists, please measure first paint, a document with connections, the 2000 node case, the
  validation timeout and the backend round trip.
- **Plan for duties 1 to 4.** Yes, please send it. We will review it for: the node id you
  settle creation with must be the id a later snapshot contains (a wrapper id that never
  appears becomes unknown after the timeout); client-supplied connection ids; an absolute
  update call for rotation and mirror; a revision that only grows, present on reads and on
  change notifications; every edit settled; history state and a snapshot pushed after undo
  or redo. We will send the list of edit intents with their old and new fields together with
  our adapter design.

## What each planned change gives you

Five changes remain, in build order (changed: the adapter moved up, because editing cannot
be wired without it).

**1. add-consumable-package: install from the npm registry.** Done and ready to publish;
see the reply above. React is a peer dependency. Node 20 or later is supported.

**2. add-snapshot-sync-adapter: your store owns the document (implemented on `main`; see
`docs/guide-host-authority.md` and `docs/host-connection-identity.md`, section 12).** The editor shows the user's
edit at once, hands it to your callback and waits for your answer. You decide who owns undo
(`history: "host"` forwards undo and redo to you) and when to push snapshots. When you name
nodes, creation is delegated: a placeholder marks the drop position until you answer
`settle(opId, { status: "accepted", nodeId })` and a snapshot holds that node. One
`timeoutMs` option covers delegated creation and the validator; there is no library
default, so set it yourself (e.g. 5000). Edits still waiting for you carry an unconfirmed
flag (the library paints nothing). Each snapshot push is diffed, so history, viewport and
selection and gestures on surviving entities are kept; a push with an older revision is
ignored. Selection changes report an origin: user, api or model. Your duties are the seven
items in `docs/host-spike-findings.md`, section 2. Status: implemented; connections are always named by the client.

**3. add-reconnect-tool: move a wire end.** A selected connection shows a grip at each end;
dragging a grip to another port moves that end, and the connection keeps its ID. Today the
user must delete and redraw. It is off by default: you turn it on with `reconnect: {}`
(options: `onEmptyDrop` "cancel" or "delete", default cancel; grip radius, default 8 px).
Alt on the press gives it back to the normal connect gesture, so a second wire can start from
that port. Compatibility comes from your connection policy. One drag is one undo entry; a
failed or cancelled drag leaves the old wire. The core `reconnect` command already exists.
Status: planned.

**4. add-docking: connect by dropping a node next to another.** While the user drags a node,
the best port of another node within 40 px (facing ports preferred) is previewed; releasing
connects the facing ports without a separate connect gesture. Two modes: `snap` (the node
moves so the port anchors coincide) and `connect` (the node stays where dropped; only the
wire is created). Off by default; you enable it and choose the mode. Compatibility comes
from your connection policy, including asynchronous verdicts (`onPendingRelease` is
`move-only` by default, or `wait`). Alt suppresses docking and the key is configurable. A
dock is one atomic undo entry; a rejected dock changes neither position nor connection.
Status: planned; shares no code with the reconnect tool.

**5. add-host-integration-checks: checks and small fixes (last).** Mostly verification in
the demo and browser tests, fixing only what fails. Visible results: the view fits once when
the first content arrives after mount (a new `initialFit` value); node titles and port
labels hide below zoom thresholds you set; a dash per connection kind in the theme next to
colour; one library-wide grid step, off by default and changeable at run time, with no Alt
override (Alt keeps only docking suppression and the wire-end bypass). You also get an
example that creates a node at a pointer-up position from outside the view, and checks of
runtime styling, port normals, host symbol images, shortcuts, marquee modes, and a benchmark
at 50 to 500 nodes plus a 2000 node stress case. You decide the thresholds and the grid
step. Status: planned. We will ask for your measurements once the adapter is available.

## What to do on your side

The seven-item host work list is in `docs/host-spike-findings.md`, section 2. Items 1 to 4 are
backend changes (inner ID, client connection ID, absolute update, revisions); items 5 and 6
are the adapter's settle and history pushes; item 7 is optional.

## What to pin

Keep the sibling link until we announce that 0.1.0 is published on the npm registry, then
install `@paceholder/nodeeditor-js@0.1.0`. Please tell us whether your registry can fetch
public npm packages. Send the measurements listed above when the adapter is available.
