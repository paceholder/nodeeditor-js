# Proposal

## Why

Keyboard copy, cut and paste run only from the browser's native `copy`, `cut` and `paste`
events: the key-down of Mod+C, Mod+X and Mod+V keeps its default, the browser fires the
event, and a listener on the document runs the editor command with the event's clipboard
data. That gives one command per shortcut and needs no permission prompt. The view's root,
though, is a focusable `div` that is neither editable nor holding a text selection, and
WebKit (Safari on macOS and iPadOS) is generally reported to fire clipboard events, and to
enable Edit > Copy and Paste, only when there is a selection or an editable focused element.
If that holds, the three shortcuts do nothing in Safari, a browser on the support matrix
(current and previous stable). The view hardening recorded this as unverified because the
browser tests drive Google Chrome only and no WebKit build may be downloaded.

This change makes the three shortcuts work in WebKit without ever running a command twice,
and, because CI cannot run WebKit, proves it with a manual verification checklist on real
Safari, plus an automated test of the shared code path in Chrome.

## What Changes

- **Clipboard proxy.** When one of the three chords is pressed while the editor owns focus
  (focus in the root, not in a text field or host content in the overlay), the view moves
  focus for the duration of that key press to a hidden, editable proxy element inside the
  root (a `textarea` holding a selected placeholder for copy and cut), so the browser fires
  its native event on an editable element. The existing bridge then runs the command from
  that one event, exactly as today, and focus returns to the root. The "the event alone runs
  the command" rule is kept, so no timed fallback and no second command exist.
- **One code path or a WebKit-only path.** The proxy can run in every browser (one path,
  tested in Chrome) or only where it is needed; the design recommends every browser, with a
  view option to turn it off, and leaves the choice to the owner.
- **No side effects.** The proxy is off-screen with `position: fixed`, focused with
  `preventScroll`, has `inputmode="none"`, `aria-hidden="true"` and `tabindex="-1"`, so the
  page does not scroll, the on-screen keyboard does not open and screen readers do not
  announce it.
- **Manual verification checklist.** A dated checklist in `notes.md` for Safari current and
  previous stable on macOS and Safari on iPadOS with a hardware keyboard: the shortcuts,
  the Edit menu, two editors on one page, text fields in the overlay, focus return, scrolling
  and the on-screen keyboard. Before the fix the same checklist records whether the problem
  exists at all; if Safari already fires the events, the change closes as not needed.

Requirements refined: the keyboard editing shortcuts rule (copy, cut and paste shortcuts),
the validated paste with fallback rule (the in-app path stays), the input scoping rule (two
editors and text fields) and the published support and versioning policy rule (Safari is on its support matrix).
New requirement: clipboard shortcuts without a text selection.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `interaction`: clipboard shortcuts work in browsers that fire clipboard events only for an
  editable focus or a selection.

## Out of scope

- The Async Clipboard API (`navigator.clipboard.readText` shows a paste prompt in Safari and
  would make paste depend on a permission); `view.clipboard` keeps offering it for host
  buttons.
- Context-menu Copy and Paste of the browser over the canvas (the canvas has no text; the
  library ships no menu).
- An automated WebKit run in CI. A local opt-in through `safaridriver` is an open question,
  not part of this change.
- Firefox: it fires clipboard events for a focused non-editable element as Chrome does
  (the shared path covers it); a Firefox run is a manual line of the checklist only if the
  owner wants it.

## Dependencies

None. The fix lives in `src/view/interact/clipboard/` and the key handling in
`src/view/interact/input/`.
