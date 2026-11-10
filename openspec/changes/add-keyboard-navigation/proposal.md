# Proposal

## Why

The editor can be used from the keyboard only for what the shortcuts cover: select all,
clear, move (nudge), delete, undo and redo, clipboard, rotate, mirror and context actions.
Focus cannot move from one node to another, a single node cannot be selected without a
pointer, a connection cannot be made at all without one, and nothing tells a screen-reader
user what is focused or what an action did. The root already has the role `application`, a
role description and a host-replaceable accessible name (the `label` mount option), so
assistive technology passes keys through to the editor; there is just nothing for those keys
to do yet.

**This change widens a settled decision and needs the owner's approval before any task
starts.** The project context in `openspec/config.yaml` says, under the items trimmed from
R1: "accessibility reduced to keyboard shortcuts for select/move/delete/undo (no keyboard
connection chooser, no screen-reader parity)". This change adds keyboard focus movement,
keyboard connection (including the connection chooser from the keyboard) and spoken
announcements. It still does not promise screen-reader parity: there is no accessibility
tree per node, no browse mode over the graph, and the canvas stays hidden from assistive
technology. Task 0.1 records the approval and task 0.2 rewrites the config sentence.

## What Changes

- **Focused entity.** The view keeps one focused entity (a node, or a port of a node),
  separate from DOM focus, which stays on the root. It is drawn as a focus ring on the
  interaction layer, revealed (panned into view) when it moves, and cleared when its entity
  leaves the model.
- **Moving focus between nodes.** A navigation chord moves focus to the nearest node in an
  arrow's direction, and another pair of keys walks all nodes in a deterministic reading
  order. Tab and Shift+Tab still leave the editor (one tab stop, no keyboard trap). The
  chords are an open question for the owner (design D1).
- **Selection from the keyboard.** Space toggles the focused node in the selection and Enter
  makes it the only selected node; whether moving focus also moves the selection is an open
  question (design D2).
- **Port focus and keyboard connection.** On a focused node a key enters its ports; another
  starts a connection from the focused port. Focus then walks the candidate ports in the
  existing deterministic candidate order, each showing the target state the pointer gesture
  shows (compatible, incompatible with its reason, occupied, pending, choice). Enter commits
  one `connect` command (one history entry), a choice goes to the host's connection chooser
  exactly as a pointer release does, a pending verdict waits as the connect tool waits, and
  Escape cancels. The keyboard connection is a hand-rolled state machine with its own
  `involved` entities, so the existing rule that any change to an involved entity cancels a
  gesture applies to it.
- **Announcements.** One visually hidden live region in the overlay announces the focused
  entity, selection changes, the target state during a keyboard connection, its commit or
  refusal, a cancelled gesture, and undo and redo with their history labels. Text comes from
  a host-replaceable describer and the view's localizable messages; announcements are
  coalesced so fast key repeat does not flood the reader.
- **Keymap.** The new bindings are ordinary entries of the default keymap, so hosts can
  unbind or rebind them; held-key repeat is off for commit-like actions.

Requirements refined: the keyboard editing shortcuts rule (the sentence "A keyboard
connection chooser is not required" is removed), the connection-choice request rule and the
pending target resolution rule (reached from the keyboard too), the gesture lifecycle and
cancellation rule, the rule that gestures yield to any change of their entities, the one
committed edit per gesture rule, the usable shipped controls rule (unchanged text; announced
states are not conveyed by color) and the accessible root rule.
New requirements: keyboard focus between nodes, focus ring and reveal, keyboard connection,
and spoken announcements.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `interaction`: focused entity and focus movement, keyboard selection, the focus ring on
  the interaction layer, keyboard connection, the live region for announcements, and the
  keyboard editing shortcuts rule without its chooser exclusion.

## Out of scope

- Screen-reader parity: no DOM element or accessibility node per entity, no
  `aria-activedescendant` tree, no browse or reading mode over the graph.
- Keyboard reconnection of an existing connection's end, keyboard route editing, keyboard
  resize and keyboard docking.
- Spatial navigation into connections (a connection can still be selected by pointer or by
  the API; whether focus should visit connections is listed as an open question).
- A shipped chooser or menu UI: the library keeps shipping none.
- Automated screen-reader tests: the check with VoiceOver and NVDA is a manual checklist.

## Dependencies

- Needs the owner's approval of the wider accessibility scope (task 0.1). Until then this
  change stays a plan.
- Uses the existing connect candidate search and evaluation, the connection-choice request,
  the pending wait, the `involved` hook, `gesture-cancelled`, `view.reveal` and the keymap.
- Independent of `add-reconnect-tool` and `add-docking`; if those land first, their
  gestures are unaffected (they are pointer-only).
