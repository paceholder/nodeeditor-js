# Guide: installing the library in an application

How an application gets `@paceholder/nodeeditor-js`: what to depend on, what the install builds, which
Node version is needed, and how to keep one copy of React. The package has four entry points
(`@paceholder/nodeeditor-js`, `@paceholder/nodeeditor-js/view`, `@paceholder/nodeeditor-js/view/advanced`,
`@paceholder/nodeeditor-js/react`); it is ESM only and ships its type declarations.

## 1. The consumption path

The package is not on a registry yet. A host depends on the git repository, pinned to a tag
or to a commit:

```json
{
  "dependencies": {
    "@paceholder/nodeeditor-js": "git+https://example.invalid/nodeeditor-js.git#0.1.0"
  }
}
```

Use the real repository address for your copy of the library. Pin to a tag or a full commit
hash, never to a branch, so every install gets the same code. A tag works for a host only
after the tag has been pushed to the repository the host installs from.

Other ways in, by how far they reach:

- A packed tarball (`npm pack`, then `npm install ./paceholder-nodeeditor-js-<version>.tgz`) installs
  the same files a registry would. Use it to try a build on one machine.
- A folder link (`npm install ../nodeeditor-js`, or a workspace link) points at the
  developer's checkout. It works only on a machine where that folder exists, so it does not
  suit containers or CI. Read the React note in section 4 before using it.
- A registry can come later. The package stays `private: true` until that decision; a git
  dependency works with a private package.

## 2. What the install builds

`dist/` is not committed. A git dependency runs the package's `prepare` script (`tsup`)
when it is installed, and npm installs the library's development dependencies first so the
build tools (`tsup` and TypeScript) exist at that moment. The result is `dist/` with
JavaScript and `.d.ts` files for every entry point, with no manual build step.

The install therefore needs network access to fetch those development dependencies and
takes a few seconds longer than a registry install. With npm 10, a production-only install
(`--omit=dev`) and an install with `--ignore-scripts` both still produced `dist/` for the
git dependency, because npm builds git packages itself. Other package managers were not
checked; if one skips the build, install the packed tarball instead (`npm ci` and
`npm run build` in a checkout, then `npm pack`).

## 3. Node version

Built files run on Node 20 and later; `engines` says so. The build, the headless tests and
the consumer smoke were checked on Node 20. A host that builds with Vite needs the Node
version its own Vite release asks for, which can be newer.

## 4. React

React 19 or newer is an optional peer dependency (`react` and `react-dom`). Core and view
install and build without it. The library never bundles React, so a host that imports
`@paceholder/nodeeditor-js/react` brings its own copy and ends up with exactly one. When a bundler
links the library from a folder, it can find a second copy of React next to the linked
source; tell the bundler to resolve one copy (dedupe or alias) as described in
[guide-react.md](guide-react.md).

## 5. Checking an install

`node scripts/consumer-smoke.mjs` in this repository builds, packs and installs the package
into throwaway projects: the tarball with and without React, a linked folder with and
without the bundler's dedupe setting, and a git URL pinned to a commit in an empty project.
Each project imports every entry point, builds with Vite and type-checks with `tsc`. It is
not part of `npm test` because it installs packages from the network.
