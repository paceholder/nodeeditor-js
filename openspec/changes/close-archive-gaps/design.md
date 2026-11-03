# Design

## Context

The gap lists in the four comparison reports were checked against the current specs; items
already covered, deliberately dropped, domain-specific, or owned by other planned changes
were removed. What remains is wording.

## Decisions

- **D1 Reuse IDs.** Where a requirement exists, it is MODIFIED with the sentence added and
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
- **D6 Accessibility.** Known limit stated in the usable shipped controls rule: keyboard shortcuts and shipped DOM
  controls only; remaining barriers are documented with the support matrix.
- **D7 Verification layers.** A repository statement, checked by a doc check, not
  new test infrastructure: headless tests, geometry property tests, real-browser tests,
  failure injection through adapters, visual snapshots as supplementary evidence, and
  performance runs; DOM emulators are not rendering-speed evidence.
- **D8 Extension checklist.** A list of demonstrations an extension author can
  run, each tied to an existing example or test; no new examples are required by this
  change beyond naming where each is covered.

## Open questions

- The concrete reference machine and the memory ceiling; both are fixed after the first
  recorded run on it.
- Whether "use-case completion does not waive unexercised clauses" belongs in
  `config.yaml` rules; left to the user (see notes in the report).
