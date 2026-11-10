# Host: what is still open

Items not yet settled or not yet delivered. Resolved decisions are in
`docs/host-review-notes.md`; the library's plan is in `docs/host-response.md`.

## 1. Questions to the host

1. **Measurements.** Replace the planning figures with measured values once the adapter
   exists and the host can run the benchmark on a real project: 5 s validation timeout,
   100 ms round trip, 50 to 500 typical nodes, 2000 as a stress case.
2. **Spike items not yet checked (partly resolved).** Dashed wires on screen, a large document (a 1200
   component template exists), and rotated or mirrored symbols beyond the sample template.
   Answered in section 5: the large document is checked, rotation and mirror are checked on
   the sample only, and dashes cannot be checked until the library offers them.
3. **Confirm Node 20.** Resolved: Node 20 is enough; supported and tested on 20 and 22.

## 2. Host-side duties

The adapter plans depend on these.

1. Return the inner component ID from the node create call (the wrapper ID is not what reads
   use).
2. Accept an optional client-supplied connection ID, and reject a connection whose port pair
   is already connected (the host does not do this today). The reasoning, the options and
   the concerns are in `docs/host-connection-identity.md`.
3. Add an absolute update call for rotation and mirror. Until then, translate the old and new
   values of an intent into relative steps.
4. Put a monotonic revision on schematic reads and on the change notification. A push
   without a revision is always applied.
5. Settle every handed-over edit as accepted, rejected or unknown: return a promise from
   the callback, or call `settle(operationId, outcome)` later. A created node is named in
   the answer, `settle(operationId, { status: "accepted", nodeId })`, and the result settles
   when a later snapshot contains that ID. The library never resubmits.
6. Push history availability and labels when `history: "host"` is used, and push a snapshot
   after each undo or redo. Also keep pushes within the snapshot size limits (set limits
   suited to the largest project).
7. Later, if duplication is wanted: one backend call that creates a fragment's nodes and its
   internal connections in one undoable step. The create-fragment intent already fits it.
   Until then the host answers "not supported" and the editor shows the reason.

Host decisions to apply on its side: delegated-creation timeout and validation timeout of
5000 ms; treat a validation timeout as a rejection with a reason; `onPendingRelease: "wait"`;
many connections per port (host policy decides, the library assumes nothing); `marquee:
intersect`; docking mode `connect`; snapping off.

## 3. Spike requests and how each is handled

Each planned change is explained in plain language in `docs/host-response.md`, section
"What each planned change gives you".

From the read-only prototype (what worked: one node type with asset reference and own port
placements, rotation and mirror, orthogonal routing with rounded corners, controls panel,
wire colour per kind, selection through `useSelection`, TypeScript 5.6 reading the types).

| # | Request | Handling | Status |
| --- | --- | --- | --- |
| 1 | Install from a git URL (no built code is delivered today) | New change add-consumable-package: build on install, ESM, types, React optional peer, tag 0.1.0. Verified by installing into an empty project and importing the four entry points. | planned |
| 2 | Single React copy with a linked install | Document in the React guide (bundler dedupe setting) and check that only one copy is used in the git-install check. | planned, docs plus dedupe |
| 3 | Fit after the first content (`initialFit` runs at mount, host loads later) | New fit option: fit once when the model first becomes non-empty. | planned |
| 4 | Dashed wires with a colour per kind | A dash per connection kind in the theme overrides, next to colour, so no painter per dash style. | planned |
| 5 | Node engine range (22 required, 20 works) | Aim at Node 20 or later and relax `engines`. | planned |
| 6 | Label legibility (title drawn at world scale is small at fit zoom) | Hide titles and port labels below zoom thresholds (options), instead of a screen-space font. | planned |

## 4. Library decisions taken from the host's answers, not yet built

- **Snapping.** One library-wide grid step, off by default, changeable at run time without a
  remount. No Alt override, so Alt keeps two uses: suppress docking and bypass an endpoint
  grip. A node is placed off-grid by turning the grid off.
- **Docking modifier.** The suppression key is configurable (default Alt).
- **Delegated-creation timeout.** A single `timeoutMs` option with no library default; the
  host sets 5000. An unanswered creation is reported as unknown after the timeout.
- **Create-fragment (paste, duplicate).** Supported by the library; the host does not use it
  at first and answers "not supported", and the editor shows the reason.
- **Many connections per port.** The library assumes nothing; the capacity policy decides.

## 5. Host report after the second spike round

The host now has a read-only editor built on the library's current `main` (after the async
connection policy), next to the old editor and behind a local flag. Editing is not wired,
because the adapter does not exist yet. The numbers are indicative: one machine, headless
Chrome with software rendering.

### Measured

- **Large document.** A template with 1200 components and no connections renders and fits.
  Panning with the pointer and zooming with the wheel gave 181 frames: median 16.7 ms, 95th
  percentile 16.7 ms, worst 33 ms. The previous editor, on the same template and the same
  script, gave 197 frames: median 16.7 ms, 95th percentile 50 ms, worst 83 ms. Its pan gesture
  differs, so only its wheel zoom is a fair comparison.
- **Not measured.** Time to first paint, a large document with connections, the 2000 node
  stress size, the validation timeout and the backend round trip. The planning figures in
  question 1 therefore stay as they are.

### Answers to open questions

- **Node version.** The host runs Node 20.20.2. The library builds there, with a warning
  about its `engines` field. Nothing older is needed.
- **Rotation and mirror.** Checked on the sample template (symbols rotated by quarter turns
  and mirrored, port placements kept). Not yet checked on a document with every combination.
- **Dashed wires.** Cannot be checked: the library has no dash per connection kind yet
  (request 4). The host currently passes a dash to the default connection painter only.

### New items

1. **Build on install must work with a private package registry.** The host's default
   registry is a private mirror that needs authentication, and the spike could install the
   library's development dependencies only from the public registry. A git dependency that
   builds on install fetches those development dependencies in the host's own environment,
   including its container builds. The consumable-package check should state which packages
   the build needs, and either work through a mirror or offer a prebuilt alternative (a
   built archive or a branch that carries `dist`).
2. **Colours are plain strings.** The theme accepts any string and the canvas silently keeps
   the previous colour when it cannot parse one, so a wrong value gives no error. The host
   resolves its CSS variables to plain colours before calling the theme. Optional, low
   priority: a development-time warning for unparseable theme colours.
3. **Run-time theme switching works without a remount.** Passing a new theme object to the
   mount component repaints background, grid, text and the per-kind connection colours.
   Eight switches between dark and light themes, repeated three times, matched the host's
   background colour every time. This is the required run-time theme switching, now confirmed from the host.
4. **Host duties.** Items 1 to 7 in section 2 are not started on the host side. The host
   will write a plan for items 1 to 4 (backend changes) and send it for review before
   starting, since they change the host's public interface.
5. **Pinning.** The host keeps the sibling link until tag 0.1.0 exists, then switches to the
   pinned git dependency and removes the single-React-copy setting if the check shows it is
   no longer needed.

### Library reply to section 5

- **Resolved:** Node 20 (supported, `engines` warning came from an older checkout); theme
  switching at run time (intended); measurements accepted as indicative.
- **Install (item 1):** public npm package `@paceholder/nodeeditor-js@0.1.0`, to be
  published by the owner; open question to the host: does the registry proxy public npm, or
  is it private-only (then we offer a tarball)? Pinning (item 5): keep the sibling link
  until the publish is announced; the single-React-copy setting is then droppable.
- **Colour strings (item 2):** an optional development-time warning is under consideration.
- **Host duties (item 4):** please send the plan for items 1 to 4; review points are in
  `docs/host-response.md`.
- **Dashes:** planned with the last change; keep passing a dash to the default painter.
- **Still open:** measurements after the adapter exists (first paint, document with
  connections, 2000 nodes, validation timeout, backend round trip).
