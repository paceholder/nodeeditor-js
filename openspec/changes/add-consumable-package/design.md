## Context

The package is a single ESM package with four entry points built by tsup into `dist/`. It is
`private: true` and has no consumers yet. The only supported way in is a dependency on the git
repository, so the install must build `dist/` itself.

## Goals / Non-Goals

**Goals:** a verified answer for install, build, Node baseline and React deduplication; a
documented path; a pinned local tag.
**Non-Goals:** registry publication, release automation, pushing the tag.

## Decisions

- D1 Packaging smoke: a throwaway consumer project under `examples/` that installs the packed
  tarball (`npm pack`) and builds with Vite and `tsc`; run by a script, not part of `npm test`.
  A second run installs from a git URL pinned to a commit into an empty project, which proves
  the install-time build script produces `dist/`. React 19 stays an optional peer dependency.
- D2 Node baseline: the aim is Node 20 and later for consumers of `dist/`. Whether the
  build and the tests also run on Node 20 is a check, not an assumption; the `engines` field
  follows the result, and if only development needs a newer Node it goes into `devEngines`
  with a docs line. This is a packaging decision, not a requirement.
- D3 Tag: the tag `0.1.0` is created locally, on the commit that passed every task, only after
  verification. Pushing it is a separate approval by the owner, so a git dependency pinned to
  the tag works only after that push.

## Risks / Trade-offs

- The git install needs the build tools at install time; a `prepare` script that needs
  devDependencies fails in hosts that install with production-only settings. The smoke records
  what works and the guide says so.

## Settled Questions

- `private: true` stays until a registry decision; a git dependency works with a private
  package. This is a temporary decision, recorded here and not as a requirement, so a later
  registry publication needs no spec change.
