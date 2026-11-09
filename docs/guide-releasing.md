# Guide: releasing to npm

How the owner publishes `@paceholder/nodeeditor-js`. The first publish is manual from a
laptop; later releases are published by the release workflow when a version tag is pushed.

## 1. First publish (manual)

1. Start from a clean checkout of `main` and run `npm ci`.
2. Run the gates: `npm run lint`, `npm run typecheck`, `npm test`, `npm run test:browser`,
   `npm run build` and `node scripts/consumer-smoke.mjs`.
3. Look at what would be published: `npm pack --dry-run`. It must list only `dist/`,
   `package.json`, `README.md` and `LICENSE`.
4. Sign in: `npm login`. The account must own the `@paceholder` scope (the npm user
   `paceholder` owns the organization).
5. Publish: `npm publish --access public`. npm asks for the two-factor code. `prepublishOnly`
   runs lint, typecheck and tests, and `prepare` builds `dist/`.

Provenance is not set in `package.json`. A provenance attestation needs a supported CI
identity, so `publishConfig.provenance` would make this laptop publish fail. Only the release
workflow passes `--provenance`, so the first version has no attestation.

## 2. Push the branch and the tag

After the manual publish, push `main`, then the existing tag `0.1.0`
(`git push origin 0.1.0`). The tag triggers the release workflow
(`.github/workflows/release.yml`). For this first version the run fails at the publish step,
because `0.1.0` is already on the registry and trusted publishing is not set up yet; the
earlier steps (tag check, gates, smoke) still show that the workflow works. If you prefer a
green run, skip pushing the tag until the first release made through the workflow.

Tags are immutable in practice: once a version is published, never move or reuse its tag.

## 3. Enable trusted publishing

After the first publish the package exists on the registry. On npmjs.com open the package
settings, add a trusted publisher of type GitHub Actions for the repository
`paceholder/nodeeditor-js` and the workflow file `release.yml`. From then on the workflow
publishes with a short-lived OIDC identity and no stored token; delete any npm token that was
created for CI.

## 4. Later releases

1. Update the version: `npm version <patch|minor|major> --no-git-tag-version`, commit it.
2. Wait for CI to pass on `main`.
3. Create the annotated tag with the same name as the version, without a `v` prefix:
   `git tag -a 0.1.1 -m "message"`.
4. Push the commit and then the tag: `git push` and `git push origin 0.1.1`.

The workflow refuses to publish when the tag name differs from the `version` in
`package.json`. It runs lint, typecheck, tests, the build and the consumer smoke before
`npm publish --provenance --access public`. Do not push pre-release tags such as `1.0.0-rc.1`:
they would publish under the `latest` dist-tag.

## 5. Mistakes

- A published version can be removed with `npm unpublish @paceholder/nodeeditor-js@<version>`
  only within 72 hours of publishing (and only if nothing depends on it). After that, publish a
  fixed version and mark the bad one with `npm deprecate`.
- A version number can never be published again once used, even after an unpublish.
- If the workflow fails before publishing, fix the problem, bump nothing, delete the remote
  tag (`git push origin :refs/tags/<tag>`), recreate it on the fixed commit and push again.
  This is safe only while nothing was published for that version.
