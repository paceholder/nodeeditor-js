# Design

## Context

- `interact/clipboard/clipboard-events.ts` listens for `copy`, `cut` and `paste` on the
  document and acts only while focus is inside this editor's root and not in a text field
  or overlay host content (`isTextTarget`, `isOverlayContent`). It writes and reads
  `text/plain` through the event's `clipboardData` and calls `preventDefault`. There is
  deliberately no timed fallback: browsers read the system clipboard asynchronously before
  a paste event, so "no event came within N ms" races the real event.
- The keymap marks Mod+C, Mod+X and Mod+V as `native: true`: the key-down is not
  default-prevented, so the browser's own action fires the event.
- `view.clipboard` (`copy()`, `paste()`, `pasteFromSystem()`, `exportText`, `importText`)
  works without the events, for host buttons. Mod+D (duplicate) does not use the clipboard.
- The browser tests run in the installed Google Chrome only (`vitest.config.ts`). No WebKit
  build is installed and none may be downloaded. `safaridriver` exists on the owner's
  machine, but the project has no WebDriver provider for Vitest.

## Goals / Non-Goals

**Goals:** the three shortcuts run their command exactly once in Safari on macOS and iPadOS;
nothing changes for Chrome and Firefox users; no permission prompt; proof by a manual
checklist where automation is impossible.

**Non-Goals:** the Async Clipboard API path, a WebKit CI run, the browser's context menu.

## Decisions

### D1. First verify that the problem exists

Task 1.1 runs the checklist on the current code. If Safari fires the three events for a
focused, non-editable root with no selection and the shortcuts work, the change closes as
not needed and `notes.md` records the evidence (browser versions, date). Only a reproduced
failure starts the fix.

### D2. Make the native event fire instead of replacing it

Options:

| Option | How | Trade-off |
| --- | --- | --- |
| A. Hidden editable proxy | On the chord's key-down, focus a hidden `textarea` inside the root (selected placeholder text for copy and cut); the browser fires its native event there; on the event (or the key-up) focus returns to the root | Keeps "the event alone runs the command" and the event's `clipboardData` for both directions; costs a focus move per shortcut. |
| B. Temporary selection | On key-down, select the text of a hidden span so the document has a selection | Fires `copy` but not `paste` or `cut` in WebKit, which need an editable target; not enough alone. |
| C. Key-down runs the command with the Async Clipboard API | `navigator.clipboard.writeText` for copy and cut, `readText` for paste | Paste shows Safari's paste bubble on every shortcut and can be denied; two paths (event and key-down) risk two commands in browsers that fire both. |

Decision: **A**. It is the only option that keeps one source of truth for running the
command (the native event), so no browser can run a shortcut twice.

Details:

- The proxy is created at mount inside the root, never at import time, and removed at
  dispose. It is `position: fixed` off-screen, 1 by 1 pixel, `opacity: 0`,
  `aria-hidden="true"`, `tabindex="-1"`, `inputmode="none"`, `autocomplete="off"`,
  `spellcheck="false"`.
- On key-down of a `native` clipboard chord, when the editor owns focus, the view focuses
  the proxy with `preventScroll: true`; for copy and cut it fills the proxy with one
  placeholder character and selects it. The key-down is still not default-prevented.
- The bridge treats the proxy as the editor's own element: `owns` accepts focus on the
  proxy although it is a text target. Any other text field keeps its own clipboard as
  today.
- Focus returns to the root on the clipboard event, on key-up, on blur and after one
  animation frame at the latest, whichever comes first; the proxy is emptied. Returning
  focus does not scroll and does not raise the root's focus ring logic again.
- A key-down that is a repeat (`event.repeat`) does nothing new: one held shortcut is one
  command, matching the one-step-per-held-key rule.

### D3. Where the proxy runs (open question)

Options: (a) **every browser**: one code path, exercised by the Chrome browser tests, and a
view option `clipboardProxy: false` turns it off for hosts that manage focus themselves;
(b) **WebKit only**, detected by feature test at mount (a synthetic check is not reliable,
so in practice by user-agent), leaving Chrome and Firefox exactly as today but leaving the
WebKit path untested by CI. Recommendation: (a). Owner to decide.

### D4. Verification without WebKit in CI

- Chrome browser tests prove the shared path: the proxy receives focus, the native event
  fires there, the command runs once, focus returns to the root, nothing scrolls, two
  editors keep separate clipboards, a text field in the overlay keeps its own copy.
- The WebKit behavior is proven by the manual checklist in `tasks.md`, run on real Safari,
  with the results recorded in `notes.md` with browser and OS versions and date. Each
  checklist line names the requirement scenario it checks.
- An opt-in local run through `safaridriver` (a WebDriver provider for Vitest browser mode)
  is an open question: it would automate the checklist on the owner's machine but not in CI.

## Risks / Trade-offs

- Moving focus can make a screen reader announce something; `aria-hidden` on the proxy and
  the immediate return should keep it silent, and the checklist includes a VoiceOver line.
- A host listening for `focusin` on the root's descendants sees the proxy briefly; the guide
  documents it, and the option of D3 turns the proxy off.
- iPadOS with a hardware keyboard may still show the shortcut bar when a text field gains
  focus; `inputmode="none"` is expected to prevent the on-screen keyboard but not
  necessarily the bar. The checklist records it.

## Open questions for the owner

1. Proxy in every browser (recommended) or WebKit only (D3)?
2. Add an opt-in local Safari run through `safaridriver`, or rely on the manual checklist?
3. Which Safari versions and devices the checklist must cover (proposed: macOS Safari
   current and previous stable, iPadOS Safari with a hardware keyboard).
