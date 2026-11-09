# Design

## Decisions

- D1: The `"use client"` directive is added to the built React entry only. The bundler drops
  directives found in sources, so it is added at build time (a banner for that entry, or a
  small post-build step if the config cannot target one entry). A test reads the first line
  of every built entry.
- D2: Chooser trampoline: at mount the component installs one function that calls the latest
  `chooseConnection` prop. The view cancels a pending choice whenever a chooser is installed,
  so the installed function is swapped only when the prop goes between present and absent.
- D3: Hook values are re-read only after a view or model event, or when the reader changed,
  not on every render. A version counter bumped by the subscription decides. This stops a
  reader that returns a fresh nested value from looping.
- D4: A remount carries viewport and selection like it already carries the lock state, kept
  in refs and applied through the mount option `initialViewport` and the selection API. The
  carried state is dropped when the model identity changes.
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
- D9: The duplicated source-map line is removed by a tsup/esbuild configuration change; a
  test over the built files keeps it that way.

## Risks

- The environment and branch protection are repository settings this change cannot create;
  the release guide lists them as owner steps.
- Actions are pinned by commit and need a manual bump to update.
