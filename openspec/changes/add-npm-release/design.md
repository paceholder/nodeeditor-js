# Design

## Context

The earlier change `add-consumable-package` kept `private: true` "until a registry decision".
That decision is now made: the owner publishes to npm under the scope `@paceholder`
(the npm user `paceholder` owns the organization). The earlier decision is superseded.

## Decisions

- D1: `private` is removed and `publishConfig.access` is `public` (a scoped package is
  restricted by default).
- D2: Provenance is not set in `publishConfig`. Provenance attestations need a supported CI
  identity, so a publish from the owner's laptop would fail with it. The release workflow passes
  `--provenance` explicitly; the first publish is manual and has no provenance.
- D3: `files` lists `dist`; npm always adds `package.json`, `README.md` and `LICENSE`.
  A node test checks the `npm pack --dry-run --json` list so nothing else slips in.
- D4: `prepare` (`tsup`) stays because git installs need it (the "Consumable build" requirement). `npm publish` runs
  `prepare` and `prepublishOnly`; to avoid building twice, `prepublishOnly` runs lint, typecheck
  and tests only, and the build comes from `prepare`, which runs on publish and pack.
- D5: The release workflow triggers on tags shaped like `0.1.0` (no `v` prefix, matching the
  repository's tags), fails if the tag differs from the package version, and publishes with npm
  trusted publishing (OIDC), so no long-lived token is stored. Trusted publishing is enabled on
  npmjs.com after the first manual publish, because the package must exist first.
- D6: CI runs the checks on Node 20 and 22. The consumer smoke runs as its own job on
  ubuntu-latest. Browser tests stay out of CI: vitest browser mode launches the installed
  Google Chrome (`channel: "chrome"`), and that runner setup has not been verified, so adding
  it unverified could make CI red. Recorded in `notes.md`.
- D7: Actions are pinned to major versions.

## Risks

- Tags cannot be reused once a version is published, and an unpublish is possible only within
  72 hours; the guide says so.
