# Notes

## CI (3.1)

Browser tests are left out of CI: vitest browser mode launches the installed Google Chrome
(`channel: "chrome"` in `vitest.config.ts`), and running it on ubuntu-latest has not been
verified. The consumer smoke job runs on Node 22 only and needs no git identity (the script
sets one for its temporary repository). The workflow cannot be executed locally; only its YAML
syntax was checked.

## Release workflow (4.1)

Triggers on tags like `0.1.0` (glob `[0-9]+.[0-9]+.[0-9]+*`), fails when the tag differs from
the package version, runs the gates and the consumer smoke, then `npm publish --provenance
--access public` with OIDC (`id-token: write`). npm is upgraded to 11.5.1 or newer first,
because trusted publishing needs it and Node 22 ships npm 10. The YAML parses (checked with
Ruby's YAML parser); the workflow itself cannot run before a push. The glob would also match a
pre-release tag such as `1.0.0-rc.1`, which would publish under the `latest` dist-tag; the
guide tells the owner to avoid such tags until a dist-tag rule is added.
