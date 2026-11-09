# Notes

## Consumer smoke (1.1, 1.2, 1.3)

`node scripts/consumer-smoke.mjs` builds the package, packs it and runs four scenarios in
throwaway projects: the tarball with React (all four entry points import, types ship, `tsc
--noEmit`, `vite build` of core, view and react entries, a core-only bundle without view or
react code, one React runtime), the tarball without React, a linked folder (one React runtime
with the dedupe setting; without it the check fails, which proves the check can fail), and a
git URL pinned to a commit in an empty project.

- 1.1 first run: tarball, no-React and link scenarios passed; the git scenario failed because
  `dist/` was not built on install.
- 1.2 needed: only a `prepare` script (`tsup`) was added. Export map, declarations and peer
  metadata (React 19 optional peer, ESM only) needed no change.
- 1.3 passed: the bundle holds as many React markers as a control bundle without the library,
  and a hook call through the react entry point succeeds; two copies make it fail.
- The git scenario installs a snapshot of the working tree committed in a temporary repository,
  so it checks work that is not committed yet. `npm pack` runs the `prepare` build too.
- The script is plain Node ESM and is excluded from the checked-JavaScript typecheck pass.
