## Why

A host consumes the library as a dependency, often built in a container or CI where a sibling
folder does not exist. Nothing yet proves that the built `dist/` installs and builds in a fresh
project, that a git dependency pinned to a tag or commit produces `dist/` on install, that
exactly one React copy ends up in a host bundle, or which Node versions are supported. This
small change proves those, fixes only what fails, documents the install path, and creates the
first local tag so a host can pin to it.

## What Changes

- Consumer smoke: a script and a throwaway consumer project that install the packed tarball
  into a fresh Vite and TypeScript project, import each entry point, build, and repeat without
  React; a second run installs from a git URL pinned to a commit into an empty project.
- Fix export map, declarations, peer metadata or the install-time build (a `prepare` build
  script) only where the smoke fails.
- Single React copy: the smoke bundles a small React component and asserts exactly one React
  runtime, from the tarball and from a linked folder with the host bundler's dedupe setting.
- Node baseline: check whether the build, the tests and the smoke run on Node 20 and set
  `engines` from the result (fallback: a development-only requirement).
- Documentation: a guide for installing from a git tag or commit, and a note that React is a
  peer dependency and a host bundler must resolve one copy when it links the library.
- Tag: once the change is verified, create the local tag `0.1.0` (tagging only).
  `private: true` stays until a registry decision (temporary, recorded in the design, not a
  requirement).

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `packaging`: consumable build, git install and single React copy. This requirement
  moved here from `add-host-integration-checks`; its text is unchanged.

Requirements implemented or refined: the ESM package with typed entry points rule, the no global side effects rule, the published support and versioning policy rule and the consumable build rule.

## Impact

- Code: `scripts/consumer-smoke.mjs`, `examples/consumer-smoke/`, small fixes in `package.json`
  and the tsup config only where a check fails; docs (a new install guide,
  `docs/guide-react.md`); `AGENTS.md` and `openspec/config.yaml` if the Node baseline changes.
- Order: apply first, right after the async connection policy and before every other planned
  change, because the host cannot install the library until it lands. It has no code
  dependency on the others.

## Out of Scope

- Pushing the tag, registry publication, release automation (the user approves pushing
  separately).
- Safari/Firefox runs and real device WebView testing.
