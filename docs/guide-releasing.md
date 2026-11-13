# Guide: releasing to npm

How the owner publishes `@paceholder/nodeeditor-js`. The first publish is manual from a
laptop; later releases are staged by the release workflow when a version tag is pushed and
go live when the owner approves them on npmjs.com.

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
`paceholder/nodeeditor-js`, the workflow file `release.yml` and the environment `release`.
This change needs a signed-in session with two-factor authentication; an access token that
bypasses it is refused. From then on the workflow authenticates with a short-lived OIDC
identity and no stored token; delete any npm token that was created for CI.

Under "Allowed actions" leave both boxes empty ("Allow npm publish" and "Allow npm
dist-tag"). `npm stage publish` is always allowed, and it is the only thing the workflow
does: a run of the workflow can then never put a version live by itself. A new trusted
publisher expires unless it is used within two days, so set it up shortly before a release.

## 4. Later releases

1. Update the version: `npm version <patch|minor|major> --no-git-tag-version`, commit it.
2. Wait for CI to pass on `main`.
3. Create the annotated tag with the same name as the version, without a `v` prefix:
   `git tag -a 0.1.1 -m "message"`.
4. Push the commit and then the tag: `git push` and `git push origin 0.1.1`.
5. When the workflow run is green, the version is staged, not yet installable. On npmjs.com
   open the package's "Staged Packages" tab, check the version and its dist-tag, and press
   Approve; npm asks for the two-factor code. From a terminal the same is
   `npm stage list @paceholder/nodeeditor-js`, `npm stage download <stage-id>` to look at the
   tarball, and `npm stage approve <stage-id>`.

The workflow refuses to stage when the tag name differs from the `version` in
`package.json`, or when the tagged commit is not on `main`. It runs lint, typecheck, tests,
the build and the consumer smoke before `npm stage publish --provenance --access public`.

A version with a pre-release part, such as `1.0.0-rc.1`, is staged under the `next`
dist-tag, so `npm install @paceholder/nodeeditor-js` keeps installing the last stable
version. Users opt in with `npm install @paceholder/nodeeditor-js@next`. The dist-tag is
fixed when the version is staged; approval cannot change it.

### Repository settings the workflow relies on

These are set once on GitHub; the workflow cannot create them:

1. **The `release` environment.** Settings, Environments, New environment, named `release`.
   Add yourself as a required reviewer, so a pushed tag waits for your approval before the
   job runs, and restrict deployment to protected branches and tags if you like.
2. **Trusted publisher.** Section 3: the trusted publisher on npmjs.com can also name the
   `release` environment, which ties publishing to the approved job.
3. **Protect `main`**, so only reviewed commits can be tagged for release.

### Updating the pinned actions

Third-party actions are referenced by full commit, with the version in a comment, so a
moved tag cannot change what runs. To update one, look up the commit of the new tag
(`git ls-remote --tags https://github.com/actions/checkout 'v4*'`, or the release page),
replace the commit and the comment in both workflow files, and run `npm test` (a test checks
the format).

## 5. Mistakes

- A published version can be removed with `npm unpublish @paceholder/nodeeditor-js@<version>`
  only within 72 hours of publishing (and only if nothing depends on it). After that, publish a
  fixed version and mark the bad one with `npm deprecate`.
- A version number can never be published again once used, even after an unpublish.
- If the workflow fails before staging, fix the problem, bump nothing, delete the remote
  tag (`git push origin :refs/tags/<tag>`), recreate it on the fixed commit and push again.
  This is safe only while nothing was published for that version.
- A staged version that should not go live is removed with Reject on the "Staged Packages"
  tab or `npm stage reject <stage-id>`. A staged version holds its version number like a
  published one, so reject it before the same version is staged again.
