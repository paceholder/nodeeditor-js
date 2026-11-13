# Backlog

Prioritized list of work that is specified or planned but not finished. One row per open
change in `openspec/changes/`, ranked by what to do next, followed by ideas that have no
change yet. Update this file whenever a change is proposed, reprioritized, finished or
archived: archived changes leave the list (their history is in `openspec/changes/archive/`).

Status counts are open tasks of the change's `tasks.md`. Priority is a recommendation, not a
settled decision; reorder freely.

## Open changes

| # | Change | Open tasks | Status | Blocked on |
| - | ------ | ---------- | ------ | ---------- |
| 1 | `route-clipboard-to-host` | 0 of 19 | Implemented and merged | Nothing: archive it with the next change |
| 2 | `stage-releases-for-approval` | 1 of 4 | Workflow changed; 3.2 needs a real staged release | The next release, approved on npmjs.com with two-factor authentication |
| 3 | `add-reconnect-tool` | 9 of 9 | Planned; core `reconnect` command already exists, view tool missing | Nothing |
| 4 | `add-docking` | 10 of 10 | Planned; snap and connect-only modes, policy-driven compatibility | Nothing |
| 5 | `fix-safari-clipboard` | 16 of 16 | Planned; hidden clipboard proxy for WebKit | Owner decision on scope; needs a real Safari for the manual checklist |
| 6 | `add-host-integration-checks` | 25 of 25 | Planned; verification of host-facing behavior, then fixes for gaps | Nothing |
| 7 | `cache-picking-polylines` | 9 of 9 | Planned; measure first, cache only if the numbers justify it | Owner decision on thresholds |
| 8 | `close-archive-gaps` | 19 of 19 | Planned; sentences and scenarios in existing specs | Task 3.3 needs a named reference machine and memory ceiling |
| 9 | `add-keyboard-navigation` | 15 of 15 | Proposed | Owner approval: it widens the settled "keyboard shortcuts only" accessibility decision (tasks 0.1 and 0.2) |

Reasoning for the order: finish what is nearly done (1, 2), then user-visible gestures that
the specs already require (3, 4), then browser and host verification (5, 6), then measured or
documentation work (7, 8), then the change that needs a product decision first (9).

## Ideas without a change yet

Later queue from the roadmap; each needs a proposal before work starts, roughly in this order.

- Host proposals accepted in the reply on `research`, each needs its own change: default
  capabilities and a `create` action (P1); icon tint (P2); snap the node's box (P3b); a
  data label for a submission (P4); the resync recipe and test (P6) and the token-free push recipe
  (P5), both folded into `add-host-integration-checks` as section 4c. Dropping content from outside (P8) is deferred
  until P1 exists.
- Waypoints on connections
- Wire jumps at crossings
- Obstacle avoidance in routing
- Replace node (swap a node's type, keeping compatible connections)
- Alignment guides while moving
- Animation hook
- Minimap
- Firefox and Safari verification (beyond the Chrome-driven browser tests)

## Housekeeping (not specs)

- Repository settings: release environment reviewers, branch protection, private vulnerability reporting.
- npm: trusted publisher must allow neither `npm publish` nor `npm dist-tag` (see `stage-releases-for-approval`).
- Side branches to rebuild or drop: `example-gallery`, `research-*`, `host-plain-language`.
