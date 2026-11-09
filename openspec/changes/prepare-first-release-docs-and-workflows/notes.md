# Notes

## Branch base

The work branch was rebased onto `main` at the start, because the release workflow and the
release guide the audit refers to were not in the original base.

## Decisions to review

- `author` in `package.json` is `{ name: "Dmitry Pinaev", url: "https://github.com/paceholder" }`,
  taken from the repository's commit author. No email was added.
- The security policy points to GitHub private vulnerability reporting; it needs to be
  enabled in the repository settings.
- The changelog calls `0.1.0` "(unreleased)"; change the heading when the tag is made.
- `treeshake` is off in `tsup.config.ts` to remove the duplicate source-map comment. The
  built output is about 200 kB smaller in total; the tree-shake test, bundle budget and
  consumer smoke still pass.
- The `"use client"` line is added by a post-build step, not a tsup banner (a banner would
  apply to all four entries).
- Viewport and selection are carried across a remount for the same model; a host that passes
  `viewState` keeps its own selection.
- Actions are pinned to `actions/checkout` v4.4.0 and `actions/setup-node` v4.4.0 (commits
  looked up with `git ls-remote`, because the `gh` tool is not installed here). Newer major
  versions exist; bumping is a manual edit of both workflows.
- The `release` environment, required reviewers, branch protection and private vulnerability
  reporting are repository settings that no file can create; `docs/guide-releasing.md` lists
  them.
- `add-npm-release` (still open) says actions are pinned to major versions and that
  pre-release tags must be avoided; this change supersedes both.

## Declaration comments with requirement codes

The built `.d.ts` files hold 489 code mentions in 8 files (the source has 787 in non-test
files; the built JavaScript has 4, inside strings). About 77% sit in a clean parenthetical
such as a pair of codes in brackets. Cheapest stripping: a post-build step in the same `onSuccess`
that removes those parentheticals from `dist/**/*.d.ts` with one regular expression, then
a hand pass over the remaining ~115 mentions that are part of a sentence. Not done here,
pending the owner's decision. `removeComments` would also work but deletes all tooltips.

## Gates

On the final tree: `npm run lint`, `npm run typecheck` and `npm test` (152 files, 994
tests) pass; `npm run test:browser` (66 files, 334 tests) passes; `npm run build` passes and
`dist/react/index.js` starts with `"use client";`; `node scripts/consumer-smoke.mjs` passes
(tarball with and without React, linked folder, git URL); `openspec validate
prepare-first-release-docs-and-workflows --strict` exits 0. Both workflow files parse as
YAML (checked with Ruby's parser); the workflows themselves cannot run before a push.
