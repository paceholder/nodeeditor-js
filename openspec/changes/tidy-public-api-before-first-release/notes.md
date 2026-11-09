# Notes

## Refusal field (1.1)

The rename was done with the TypeScript language service (find all references of each
property declaration, including object literals typed by context), then the type checker
and the test run found the rest: untyped expectations in tests, the host verdict parser
(`readVerdict` reads an untyped reply) and a structural `reason?` prop in `ViewControls`
that silently stopped showing the tooltip until it was renamed.

Fields deliberately left as `reason` (plain text or an enumerated cause, not a refusal):
`UnknownOutcome.reason`, the `pending` plan result and policy outcome, the `unverified`
execute result, `HistoryState.undoReason`/`redoReason`, `ExcludedReference.reason`, the
`gesture-cancelled` event and `ConnectionEvaluation.reason` (the presentation text a
connect preview shows for every state, including pending and choice). Fields left as
`error`: thrown values (`failure` events from a throwing handler, `onHandlerError`,
`onError`). The asset decoder's `DecodeResult` failure is flat (`code`, `message`) and has
no refusal field; it was left alone.

## Revision (2.1)

`Revision` now lives in `src/core/base/revision.ts` because the reader (data layer) and
the adapter (edit layer) both use it. A stale queued submission is refused at once with a
`rejected` result rather than a `queued` one, since nothing would run later.

## Public surface review (5.1)

Rule applied: a name is removed from the core entry only when it is low-level math or a
constant a consumer does not need and nothing outside its own module (view, react,
examples, benchmarks, scripts, docs, README, or core tests that import the entry) uses it
through the entry. Removed (4), still exported by their own files for internal use:

- `MIN_DETERMINANT`: the invertibility threshold of `invert`.
- `isFiniteAffine`: the finiteness check `invert` and the scene run.
- `BEZIER_MIN_HANDLE`, `BEZIER_MAX_HANDLE`: tuning constants of `bezierPath`.

Core runtime exports went from 133 to 129 (the change also added `operationId`).

Candidates for a later decision (no use outside their module through the entry, but
plausibly needed by a host writing its own geometry, router, picker, spatial index or
loader, so kept):

- Shapes and shape queries: `rectShape`, `roundRectShape`, `ellipseShape`,
  `polygonShape`, `isValidShape`, `shapeBounds`, `shapeContains`, `shapeDistance`
  (needed by a custom `NodeGeometry`).
- Path geometry: `nearestPoint`, `pathDistance`, `isFinitePath`, `straightPath`,
  `bezierPath` (needed by a custom path picker or router).
- Rectangle helpers: `inflateRect`, `intersectRects` (the rest of the family is used).
- Viewport math: `deviceToViewport` (its inverse `viewportToDevice` is used).
- Value predicates: `isFinitePoint`, `isFiniteRect`, `isFiniteSize`, `isFiniteVec2`,
  `isQuarterTurns`, `isInWorldRange`, `checkDpr`.
- Record checks: `validateConnectionRecord`, `validatePortRecord`,
  `checkConnectionEndpoints`, `checkPortOwnership`, `normalizeRoute`.
- Loading phases: `prepareLoad`, `commitLoad` (the two halves of `loadSnapshot`, which an
  external adapter may want).
- Ordering and fallbacks: `compareKeys` (deterministic key order for a custom spatial
  index), `placeholderGeometry`.
- Constants: `ID_KINDS`, `DOCUMENT_FORMAT`, `SNAPSHOT_FORMAT`, `DEFAULT_SNAPSHOT_LIMITS`
  (the default the model options name), `MAX_WORLD_COORD`, `MIN_DPR`, `MAX_DPR`.
- Reserved ID kinds: `groupId`, `memberKey`, `valueId` (their capabilities are not built).

Used names that are low-level but stay because the view or docs use them through the
entry: the affine functions (`affine`, `applyPoint`, `applyVector`, `compose`,
`determinant`, `identity`, `invert`), the viewport matrices, `clampZoom`, `MIN_ZOOM`,
`MAX_ZOOM`, the rest of the rectangle helpers, `polylinePath`, `polylineVertices`,
`pathBounds`, `pathPointAt`, `endTangents`, `checkJson`, `jsonEqual`, `sortKeys`.
A later option is a `core/advanced` entry for geometry math, like the view's.
