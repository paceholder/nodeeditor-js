# Findings from the first host integration

The host now runs a real schematic on `createSnapshotModel` (version 0.2.0). It owns the
document in a backend. Moves, deletes, connects, disconnects, rotates and mirrors reach the
backend, and undo and redo are the backend's.

Most of it worked as documented. This file lists what the host had to work around or could not
answer, as proposals. Each proposal is written so that it also makes sense for any other
host, not only this one. The owner decides which to take.

## 1. What worked

- One gesture is one submission. The host turned each submission into one backend request.
- Host history (`history: "host"`) and pushed snapshots restored deleted components and
  connections under their stored IDs.
- A client-named connection ID, accepted and kept by the host, needed no ID map.
- A failed or refused edit is rolled back with its message, and the failure event shows it.
- `readOnly`-style capabilities per node type removed the resize handles.

## 2. Proposals

### P1. A model-wide switch for edits the host cannot do

**Problem.** The host has no backend call for resize or for creating a node on the canvas.
Today it can turn resize off with a capability on each node type, and block creation with
`creatable: false` on each type. In delegated mode a creation gesture is still possible and
is only refused afterwards by the delegate. The user sees an action that then fails.

**Proposal.** One model option that sets default capabilities for every node, for example
`capabilities: { resize: false, create: false }`. It has the lowest precedence: node type
overrides it, and a record overrides the type, as today. Add `"create"` to the capability
actions so creation can be refused up front in the same way.

**Why it is general.** Many embedders have fixed-size nodes, or a palette that is the only
way to add nodes. A default is simpler than repeating the same flag on every type.

**Question.** Should `readOnly` stay a separate switch, or become the shortest form of the
same setting?

### P2. Themed tint for monochrome icons

**Problem.** The host's icons are SVGs drawn with `currentColor`. A canvas image cannot
inherit a colour, so the host replaces `currentColor` in the markup and keeps its own cache
key made of a content hash and the colour. A theme change then means rebuilding and
re-registering every asset.

**Proposal.** Let the asset service take an optional tint colour with the asset reference and
return the image for that pair, cached by the pair. The colour can come from a node style
field or a theme token, so a theme change invalidates by colour only.

**Why it is general.** Any icon set made of monochrome glyphs has the same need, and a
dark and light theme needs it twice.

**Question.** Is a tint part of an asset's identity in the library's cache, or is it a
painter concern applied after loading?

### P3. Corner coordinates for hosts that think in cards

**How the library works today.** A node's `position` is the world location of its body
centre, and `size` is the unrotated size. Rotation and mirroring turn the node about that
centre, so they never move `position`. This is the right core choice: the centre is the one
point that stays fixed under rotation, mirroring and anchored resize.

**Problem.** Many hosts, and most card-style editors with no rotation, think in the top-left
corner of the unrotated box, as the browser layout does. Each of them writes the same small
conversion (`centre = corner + size / 2`) on every read and write, and has to remember it in
every place.

**Proposal.** Keep the core centre-based. Export two pure helpers, one from corner to
centre and one back, both taking the unrotated size. They are rotation-free arithmetic. The
guide's section on positions should state the convention, and show that a corner of the
unrotated box is also stable under rotation, so a host may store either.

**Option for the owner.** A model-level setting for the position origin (`"center"` or
`"top-left"`, in the unrotated frame) would remove the conversion for such hosts entirely.
It touches the snapshot format, the commands and the intents, so it is a larger decision.
The helpers cover the need at low cost, and I would only take the setting if several hosts
ask for it.

**Note on the host.** The host has decided to store the centre, which is the library's own
convention, so it does not need these helpers. They remain useful for hosts that store a
corner. (Earlier thought: the host's backend stores the top-left of the *rotated* box, which
moves whenever a component is rotated. That is the awkward convention, not the library's.
The host will store the centre and an absolute rotation instead.)

### P3b. Snap the node's box, not its centre

**How the library works today.** With `gridStep` set, a move snaps the dragged node's
`position`, which is its centre, to the grid. The other selected nodes move by the same offset.

**Problem.** A node whose width is an odd number of grid cells has its edges on half
cells when its centre is on a whole cell. Nodes of different sizes then do not line up on
the grid, and a rotated non-square node lines up differently from the same node unrotated.
Users of schematic or card editors expect the edges to be on the grid.

**Proposal.** An option for what snaps: `"center"` (today's behaviour) or `"bounds"`, which
snaps the top-left of the node's displayed bounds (after rotation) and moves the centre by
the same offset. A host that wants the corner of a card on the grid sets `"bounds"`. Resize
already snaps a corner, so the two gestures would then agree.

**Why it is general.** Any editor with nodes of mixed sizes needs aligned edges, and it
holds with or without rotation.

### P4. A short label for a submission

**Problem.** The host keeps its own undo history and shows labels such as "Delete 7
components". The library already decodes a submission into intents. The host has to write
its own wording from the intents.

**Proposal.** A pure function that returns a short description from the decoded intents, for
example a kind and a count (`{ kind: "delete", count: 7 }`), so the host can phrase its own
label. It should return data, not display text, so the host controls the language.

**Why it is general.** Any host with its own history needs a name for each step.

### P5. What a host without revision tokens should do

**Problem.** Pushes are ordered by the host's own revision token. The host's read endpoint
returns no token. A push built from a read that started before an accepted edit and arrives
after it could show the old state until the next push.

**Question.** For a host without tokens, is the answer to push only after the last pending
edit has been settled, or does the library already re-apply pending edits over any push so
the old state never shows? If the second, please state it in the guide, with the case of an
edit accepted while a read is in flight. If the first, a recipe would help.

### P6. The recovery flow after an unknown answer

**Problem.** After an unknown answer or a timeout the library emits `resync-requested` and
waits for the host to push a fresh document and call `settle`. It is the least exercised
path, and the host has not wired it yet.

**Proposal.** A guide recipe with a complete host example (fetch, push, settle), and a test
in the reference host that drives it. If it takes more than a few lines, consider a helper
that takes a fetch function and does the sequence.

## 3. Decision 4 of the identity proposal

Decision 4 asked whether to export the host's compatibility rules to the library's local
connection policy. The host's recommendation, which matches the library's, is to keep the
local policy minimal and let the host validator be the only judge. The host has not
confirmed this with its owner yet.

## 4. Still open from earlier

- A dash per connection kind in the theme.
- Fit on first content, for a document loaded after mount.

## 5. Not a library matter

These were found on the host side and are listed so nobody looks for them here:

- The host passed the snapshot as an untyped value. `GraphSnapshot` already exists, so the
  host will type it.
- The host's backend rotates one quarter turn at a time, so the host converts the library's
  absolute rotation into repeated steps. The backend should accept an absolute rotation.
