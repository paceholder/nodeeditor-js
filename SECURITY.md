# Security policy

## Supported versions

The latest released version receives security fixes. While the version is 0.x, older
minor versions are not patched.

## Reporting a vulnerability

Please do not open a public issue for a vulnerability. Report it privately through GitHub:
open the repository's **Security** tab and choose **Report a vulnerability**
(<https://github.com/paceholder/nodeeditor-js/security/advisories/new>).

Include the version, a description of the problem and, if you can, a small reproduction.
You can expect an acknowledgement within a few days. A fix is released as a new version and
described in the changelog once it is available.

## Scope

The library parses untrusted input in several places: graph snapshots, pasted clipboard
text, and SVG pictures supplied through a host's asset resolver. Reports about those paths
(crashes, unbounded memory or time, escaping the canvas, script execution) are in scope.
Problems in the host application that embeds the library are not.
