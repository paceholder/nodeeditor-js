# Design

## Decisions

- D1: The `"use client"` directive is added to the built React entry only. The bundler drops
  directives found in sources, and a tsup banner applies to every entry, so a small
  post-build step (`scripts/client-directive.mjs`, run from tsup's `onSuccess`) prepends the
  line to `react/index.js` and shifts that file's source map by one generated line. A test
  builds into a throwaway folder and reads the first line of every built entry.
- D2: Chooser trampoline: at mount the component installs one function that calls the latest
  `chooseConnection` prop. The view cancels a pending choice whenever a chooser is installed,
  so the installed function is swapped only when the prop goes between present and absent.
- D3: Hook values are re-read only after a view or model event, or when the reader changed,
  not on every render. A version counter bumped by the subscription decides. This stops a
  reader that returns a fresh nested value from looping.
- D4: A remount carries viewport and selection like it already carries the lock state, kept
  in a ref and applied through the mount option `initialViewport` and the selection API.
  The state is recorded in the effect cleanup, and only when it differs from what that view
  started with, so a view torn down at once (Strict Mode) records nothing and the next mount
  still fits the content. It is dropped when the model identity changes, and the selection
  is left alone when the host passes its own `viewState`.
- D5: `onReady` stays. A `ref` prop (callback or object ref) receives the view when mounted
  and `null` in cleanup.
- D6: Command arguments are compared by value with the helper the theme prop already uses.
- D7: Release workflow: a `release` environment (the owner creates it in the repository
  settings with required reviewers; the release guide says so), a step that fails when the
  tagged commit is not on `main`, actions pinned by commit SHA with the version in a
  comment, an exact npm version, and `--tag next` for a version with a pre-release part. The
  check workflow gets `permissions: contents: read`.
- D8: CHANGELOG, SECURITY and CONTRIBUTING stay out of the tarball; only README and LICENSE
  ship next to `dist`.
- D9: The duplicated source-map comment came from tsup's `treeshake` option, whose extra
  Rollup pass appended a second comment. The option is turned off (esbuild still drops unused
  code; the tree-shake and bundle-size checks pass) and a test over a throwaway build keeps
  it that way.
- D10: This change supersedes the earlier decision to pin actions to major versions and to
  avoid pre-release tags (`add-npm-release`).

## Risks

- The environment and branch protection are repository settings this change cannot create;
  the release guide lists them as owner steps.
- Actions are pinned by commit and need a manual bump to update.
