# Design

## Context

The gap lists in the four comparison reports were checked against the current specs; items
already covered, deliberately dropped, domain-specific, or owned by other planned changes
were removed. What remains is wording.

## Decisions

- **D1 Reuse requirements.** Where a requirement exists, it is MODIFIED with the sentence added and
  its scenarios kept. New requirements only for transient overlay connections (beside the DOM overlay slot
  and the presence overlay hook rule), the touch and pen safety rule (beside the gesture lifecycle and cancellation rule and the tools as explicit state machines rule), the verification layers rule and the extension acceptance checklist rule (packaging has no
  verification home).
- **D2 Measurement method is a rule on the suite, not a new process.** The earlier trim of
  the heavy performance process stands: no separate memory campaign and no new gating
  fixture. F-REACT is defined but is a reported profile until React content exists
  (the interactive React node content rule is scheduled later); F-DENSE is a correctness and stress fixture with no budget;
  F-ALL is the existing overview fixture, named.
- **D3 Reference machine.** Gates are claimed on one named reference configuration recorded
  in the baseline `machine` record (browser, OS, hardware class, display refresh rate). The
  concrete machine and the memory ceiling are not chosen here (see Open questions); until
  they are, targets stay labeled.
- **D4 Canvas2D only for now.** Other backends are deferred. The rule that renderer objects stay behind the boundary already keeps renderer
  objects out of the model, which keeps the door open, but no backend contract is promised.
- **D5 Transient overlay connections.** A view hook draws host-supplied
  connections between world positions or entity references on the interaction layer. They
  are never model entities, never in patches, snapshots, history, or picking.
- **D6 Accessibility.** Known limit stated in the usable shipped controls rule: keyboard
  shortcuts, the accessible root (role `application`, a role description and the `label`
  mount option) and shipped DOM controls only; remaining barriers (no focus movement between
  nodes, no keyboard connection, no announcements) are documented with the support matrix.
  The rule names the coverage in general terms and leaves the list of barriers to the
  docs, so `add-keyboard-navigation`, if the owner approves it, adds its own requirements
  without rewriting this rule and only updates the documented barriers.
- **D7 Verification layers.** A repository statement, checked by a doc check, not
  new test infrastructure: headless tests, geometry property tests, real-browser tests,
  failure injection through adapters, visual snapshots as supplementary evidence, and
  performance runs; DOM emulators are not rendering-speed evidence.
- **D8 Extension checklist.** A list of demonstrations an extension author can
  run, each tied to an existing example or test; no new examples are required by this
  change beyond naming where each is covered.
- **D9 Touch and pen.** The view hardening added the touch pinch zoom rule: a second touch
  cancels the running gesture and pinches. The touch and pen safety rule therefore ignores
  only other extra pointers (a pen or mouse during another pointer's gesture, a third
  touch), instead of every second pointer as first planned.
- **D10 Revisions.** The library's revision is a plain integer since the public API tidy-up;
  the revisioned synchronization rule keeps the host's token separate, with its ordering
  declared by the adapter.
- **D11 Trackpad on a physical device.** The pinch sensitivity (0.01, delta clamped to ±10
  CSS pixels) and the `wheel: "pan"` mode were tested with synthetic wheel events only. A
  manual check on a physical trackpad (macOS Safari and Chrome, and one Windows precision
  trackpad if available) records whether pinch zoom feels proportionate, whether two-finger
  pan follows the fingers in both directions, and whether the page ever zooms over the
  canvas. It changes no spec; a tuning need becomes a follow-up for the owner.

## Open questions

- The concrete reference machine and the memory ceiling; both are fixed after the first
  recorded run on it.
- Whether "use-case completion does not waive unexercised clauses" belongs in
  `config.yaml` rules; left to the user (see notes in the report).
