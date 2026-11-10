# Design

## Context

Observed in the code:

- The root is focusable, has `role="application"`, `aria-roledescription="node editor"` and
  an accessible name from the `label` mount option (default "Node editor"); the canvases are
  `aria-hidden`. The overlay layer exists for host DOM content and focused editors.
- The default keymap (`interact/commands/keymap.ts`) binds Delete and Backspace, Mod+Z,
  Mod+Shift+Z, Ctrl+Y, Mod+A, Escape, Mod+C/X/V (native clipboard events), Mod+D, R and
  Shift+R, M and Shift+M, arrow keys and Shift+arrow keys (nudge by a step and a larger
  step), and the menu key and Shift+F10. A binding has `repeat` (default true; nudge, rotate,
  mirror and duplicate set it false). Keys match by character, or by physical key on
  non-Latin layouts. Keys typed in a text field never run a graph command.
- `view.reveal(id)` pans an entity into view. Selection calls take plain IDs.
- The connect tool (`interact/tools/connect-tool.ts`) uses the deterministic candidate order
  of `connect-candidates.ts`, the evaluation of `connect-evaluation.ts`, the connection
  chooser request for a choice, and an awaiting state with `request-verdict` and
  `validate-wait` effects for a pending verdict. Its `involved(state)` lists the source port
  and node, and the target port and node while awaiting. The router cancels a gesture when a
  committed change of any origin removes or changes an involved entity (`entity-removed`,
  `external-change`, `entity-changed`).
- Interaction-layer painters draw previews; the scene is not repainted for them.

## Goals / Non-Goals

**Goals:** every node reachable and selectable from the keyboard; a connection can be made
from the keyboard with the same policy, chooser and pending rules as the pointer; a
screen-reader user hears what is focused and what each action did; no per-node DOM.

**Non-Goals:** see the proposal's out-of-scope list; above all, no screen-reader parity.

## Decisions

### D0. Scope widening needs approval

The settled decisions limit accessibility to shortcuts for select, move, delete and undo,
with no keyboard connection chooser and no screen-reader parity. This change widens the
first two and keeps the third. Nothing is implemented before the owner approves (task 0.1).
Proposed new wording for the trimmed item in `openspec/config.yaml` (task 0.2):

> accessibility: keyboard shortcuts for select, move, delete and undo; keyboard focus
> movement between nodes and their ports; keyboard connection, including the host's
> connection chooser; and spoken announcements through one live region. No screen-reader
> parity: no accessibility node per entity and no browse mode over the graph.

### D1. Chords for moving focus (open question)

Plain arrow keys already nudge the selection, Tab must leave the editor (no keyboard trap,
the usable shipped controls rule), and some chords belong to the browser or the system
(Alt+Left is "back" in Chrome and Firefox on Windows and Linux; Ctrl+Arrow switches desktops
on macOS and cannot be caught). Options:

| Option | Spatial move | Walk in order | Trade-off |
| --- | --- | --- | --- |
| A. Primary modifier + arrow | Mod+Arrow (Cmd on macOS, Ctrl elsewhere) | `[` and `]` | Free in a non-editable root on all platforms; Cmd+Up/Down scroll the page by default, which the binding prevents. |
| B. Navigation mode | Arrows, after a toggle key (for example Enter on the canvas); nudge needs Alt | Tab inside the mode, Escape leaves the mode | Matches the composite-widget pattern, but adds a mode the user must notice, and changes what plain arrows do. |
| C. Alt + arrow | Alt+Arrow | `[` and `]` | Collides with browser back and forward on Windows and Linux. |

Recommendation: **A**. It keeps every existing binding, needs no mode, and every chord is a
keymap entry a host can rebind. Owner to decide.

Spatial move: from the focused node's centre, candidates are nodes whose centre lies in the
90-degree cone of the arrow's direction; the nearest by distance wins, ties broken by node ID.
With nothing focused, the first move focuses the node nearest the viewport centre. Walk in
order: nodes sorted by top edge, then left edge, then ID (reading order); it wraps.

### D2. Focus and selection (open question)

Options: (a) **focus moves the selection** to the focused node, Shift with the move extends
the selection, so existing commands (delete, nudge, rotate) act on what was just reached;
(b) **focus is separate**: moving focus leaves the selection alone, Space toggles the
focused node in it and Enter makes it the only selected node, like a multi-select list.
Recommendation: (b), with Enter and Space as described, because it lets a user build a
selection of nodes that are not neighbours, and (a) would make every focus move a selection
event that hosts mirroring selection would see. Owner to decide. Either way selection calls
from the keyboard carry the origin `"user"` once the selection origin of
`add-host-integration-checks` exists.

### D3. The focused entity

The view keeps `{ kind: "node", id } | { kind: "port", node, port } | none`, owned by the view
instance (no module state). It is not part of the model, history or snapshots. It clears when
its entity leaves the model (a port focus falls back to its node, if the node stays) and on a
reset. `view.focusEntity(id?)` sets it from the host; `view.on("focus-entity")` reports it.
Moving focus calls the existing reveal so the entity is in view.

### D4. Focus ring

An interaction-layer painter draws a ring around the focused node's outline (or a circle
around a port's anchor), offset outward, two CSS pixels wide, with a dashed inner line so
it does not depend on color alone. It uses theme tokens (`focusRing`, `focusRingWidth`).
It never repaints the scene, so it needs no `repaintOnHover`-like flag. The ring shows only
while the root has DOM focus and the last input was a key (as `:focus-visible` does), so a
pointer user does not see it.

### D5. Port focus and keyboard connection

- On a focused node, a ports key (proposed: P, with `repeat: false`; Enter and Space stay the
  selection keys of D2) enters its ports: focus goes to the first port in the node's port
  order; the spatial chord then moves between that node's ports, `[` and `]` walk them, and
  Escape returns to the node.
- On a focused port, a "connect" key (proposed: C, with `repeat: false`) starts a keyboard
  connection from it. The state machine is `idle -> choosing(source, candidates, index) ->
  awaiting(source, target) -> idle`, a pure transition function like the pointer tools,
  in its own file.
- Candidates are the ports the existing candidate search returns for the source, in its
  deterministic order, limited to ports in the viewport first and then the rest by distance
  from the source; `[` and `]` (or Mod+Arrow spatially) move between them, the focus ring
  and the existing connect preview show the provisional path and the target state.
- Enter on a compatible candidate submits one `connect` command; on an incompatible or
  occupied one it commits nothing and announces the rejection's message; on a choice it
  sends the existing connection-choice request to the host's chooser (keyboard focus may
  move into the chooser in the overlay and return to the root afterwards); on a pending one
  it enters `awaiting`, as the connect tool does after a release on a pending target.
- Escape, blur, hiding the view, locking it, a reset and any committed change of an
  involved entity cancel. `involved(state)` lists the source port and its node, and while
  awaiting the target port and its node; a candidate that is only focused is not involved,
  since it is evaluated again when focus moves. Cancel reasons are the existing ones.

Rejected: reusing the pointer connect tool with synthetic pointer input (its press, drag
threshold and capture rules do not fit a keyboard; a separate machine is smaller and
testable alone).

### D6. Announcements

One element in the overlay with `role="status"`, `aria-live="polite"` and
`aria-atomic="true"`, visually hidden (clipped, not `display: none`). Announcements are
coalesced per frame (the last wins) and a repeat of the same text is suppressed for 500 ms,
so key repeat does not flood the reader. Assertive announcements are not used.

What is announced: the focused entity ("Node Pump, 3 ports, selected"), selection changes
caused by the keyboard ("2 nodes selected"), the candidate's target state during a keyboard
connection ("Port In, compatible" / "Port In, incompatible: <rejection message>"), the
commit or refusal, a cancelled gesture with its reason in words, and undo and redo with
their history labels.

Text comes from a host-replaceable `describeEntity(entity, reader) => string` (default: the
node title, else its type; the port label, else its ID) and the view's message table, so a
host can localize every string. An option turns announcements off for hosts with their own
live region; they then get the same strings from a `announce` view event.

### D7. Keymap entries

All new keys are ordinary `KeyBinding`s of the default keymap with new command IDs
(`focus.next`, `focus.previous`, `focus.left`/`right`/`up`/`down`, `focus.ports`,
`focus.exit`, `selection.toggleFocused`, `selection.replaceFocused`, `connect.start`,
`connect.next`, `connect.previous`, `connect.commit`). Commit-like bindings set
`repeat: false`. Each command also runs through the command API, so a host toolbar can call
it. The keymap's existing text-field and focus-scope rules apply unchanged.

## Risks / Trade-offs

- New default bindings take keys a host may use (`[`, `]`, C); hosts can unbind them, and
  the guide lists them.
- A screen reader may still intercept some keys in its own modes; `role="application"`
  asks it not to, but behavior differs between readers. The manual checklist records what
  each reader does.
- Announcement wording matters to users and is easy to get wrong; the defaults are kept
  short and every string is replaceable.

## Open questions for the owner

1. Approve widening the accessibility scope (D0) and the proposed config wording.
2. Chords for moving focus: option A, B or C (D1).
3. Focus and selection: separate (recommended) or focus moves the selection (D2).
4. Should focus also visit connections (for keyboard delete of a single connection)?
5. Which screen readers and browsers the manual check must cover (proposed: VoiceOver with
   Safari on macOS, NVDA with Chrome and Firefox on Windows).
