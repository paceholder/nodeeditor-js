# Contributing

Thanks for helping. This file is the short version; [AGENTS.md](AGENTS.md) has the full
project conventions and the layering rules.

## Setup

```bash
npm install
npm run lint        # Biome
npm run typecheck   # whole project, core without DOM types, examples
npm test            # headless tests (Vitest, Node 20 or later)
npm run test:browser # browser tests; needs Google Chrome installed
npm run build       # dist/{core,view,react}
npm run demo        # plain demo; npm run demo:react for the React one
```

## How work is planned

Requirements live in `openspec/specs/`, one capability per folder. Planned work lives in
`openspec/changes/`: each change has a proposal, a design, tasks and delta specs. For
anything bigger than a small fix, open an issue first so the change can be agreed before
code is written. Do not change a requirement silently.

## Code and tests

- Keep files small (100 to 300 lines) and the layering intact; `src/architecture.test.ts`
  fails on a wrong-way import.
- The core must stay headless: no DOM, browser globals or React in `src/core`.
- Name the rule a test proves in words in its `describe`/`it` titles.
- A bug fix starts with a failing test.
- Every commit should pass lint, typecheck and the tests. Commit messages are plain English
  sentences about what changed.

## Reporting problems

Bugs and ideas go to the issue tracker. Security problems go through the private route in
[SECURITY.md](SECURITY.md).
