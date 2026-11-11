# Notes

## Counts

Exported names (values and types, as the compiler counts them) and runtime values (names in
the built entry), before and after:

| Entry           | Names before | Names after | Values before | Values after |
| --------------- | ------------ | ----------- | ------------- | ------------ |
| core            | 313          | 287         | 129           | 107          |
| view            | 135          | 134         | 20            | 19           |
| view/advanced   | 143          | 95          | 80            | 47           |
| react           | 26           | 26          | 16            | 16           |

The audit quoted 314, 154, 123 and 26; the numbers above were measured on the current
tree with the compiler's export list. The ceilings in `scripts/public-surface.test.ts` are
the "after" columns.

## Method

For every export of the four entries a script listed the files that import it through the
entry (resolved with the compiler), the examples, benchmarks, scripts, README, contributing
text and guides that name it, and whether it is a value or a type. Zero-use names were then
judged by the rule in `design.md`. Namespace-style imports (`import * as core`) hide names
from that listing, so the type checker was the final check: it found the two core tests
that read `defaultLimit` and `MAX_WORLD_COORD`, and the entry-point test found the two
tool-contract names below.

## Removed (still exported by their own modules)

Core (22 values, 4 types):
- Low-level math and predicates: `checkDpr`, `deviceToViewport`, `inflateRect`,
  `intersectRects`, `isFinitePath`, `isFinitePoint`, `isFiniteRect`, `isFiniteSize`,
  `isFiniteVec2`, `isInWorldRange`, `isQuarterTurns`, `isValidShape`, `MAX_WORLD_COORD`.
- Record-check helpers: `checkConnectionEndpoints`, `checkPortOwnership`, `normalizeRoute`,
  and the `RecordLookup` type that served the first two.
- Fallback and defaults: `placeholderGeometry`, `defaultLimit`.
- Reserved ID kinds whose features are not built: `groupId`, `memberKey`, `valueId`, `ID_KINDS`
  and the types `GroupId`, `MemberKey`, `ValueId`.

View (1): `DEFAULT_AUTO_PAN` (a host overrides auto-pan through `ToolOptions`; it never
needs the default object).

View/advanced (33 values, 15 types): the resize internals (`hitsResizeHandle`,
`RESIZE_HANDLE_ORDER`, `RESIZE_HANDLE_PX`, `resizeHandleEntry`, `resizeStep`,
`resizeTargetOf`, `fixedFor`, `sizeLimitsOf` and the resize state types), the auto-pan
arming steps (`armedVelocity`, `autoPanVelocity`, `startArm`, `updateArm`, `AutoPanArm`),
the long-press step (`LONG_PRESS_IDLE`, `longPressStep` and its four types), the clipboard
placement helpers (`copiedPlacement`, `duplicatePlacement`, `pastePlacement`,
`INITIAL_PLACEMENT`, `DEFAULT_PASTE_STEP`, `PlacementState`), the command registration
pieces (`registerClipboardCommands`, `registerTransformCommands`,
`CLIPBOARD_COMMAND_IDS`, `TRANSFORM_COMMAND_IDS`), and small wiring helpers
(`applySelectionChange`, `attachClipboardEvents` with its two types, `choiceOptions`,
`createHiddenIds`/`HiddenIds`, `createPreviewHost`/`PreviewHost`, `detectPlatform`,
`diagnosticsOf`, `EMPTY_VIEW_STATE`, `isEditable`, `systemClipboardOf`).
`registerBuiltinCommands`, `createClipboardService` and the other factories stay because a
host assembling a view from parts needs them.

## Kept candidates, with the reason

From the earlier review of the core entry:
- Shape builders and queries `rectShape`, `roundRectShape`, `ellipseShape`, `polygonShape`,
  `shapeBounds`, `shapeContains`, `shapeDistance`: a custom `NodeGeometry` returns shapes.
- Path geometry `nearestPoint`, `pathDistance`, `straightPath`, `bezierPath`: a custom
  router or path picker builds and measures paths.
- `validateConnectionRecord`, `validatePortRecord`: symmetrical to the kept
  `validateNodeRecord`; an external adapter validates incoming records.
- `prepareLoad`, `commitLoad`: the two halves of loading, which an external adapter may drive.
- `compareKeys`: deterministic key order for a custom spatial index.
- `isWellFormedId`: an adapter checks IDs it receives.
- `DOCUMENT_FORMAT`, `SNAPSHOT_FORMAT`, `FORMAT_VERSION`, `DEFAULT_SNAPSHOT_LIMITS`: the file
  contract a host recognises, and the default the model options name.
- `MIN_DPR`, `MAX_DPR`: used outside their module.
- `findUnknownTypes`, `resolveCapability`: a host reports unknown types after load, and a
  custom policy resolves capabilities.
- `checkJson`, `nodeTransform`: used by core contract tests through the entry.
- `IdKind` and the other ID types: they appear in the kept ID generator signatures.

New in this change:
- `NO_MODIFIERS` (advanced) and `DEFAULT_TOOL_OPTIONS` (view): the entry-point test lists
  them as part of the tool contract.
- `connectionKey`, `nodeKey` (view): they build the `SelectionKey` values that the exported
  selection events and model carry.
- `payloadString` (view): the helper a custom node painter uses to read a payload field.
- Tool factories and `createToolContext`, `resolveToolOptions`, `wheelZoom`, `toolSlot`,
  `panTool`, `selectMoveTool`, `marqueeTool`, `resizeTool`, `connectTool`,
  `createRouteEditTool` (advanced): tools are an extension contract.
- Layer painters, fallbacks, `paintScene`, `createInteractionLayer`, `DEFAULT_Z_ORDER`,
  `fitViewport`, `revealViewport`, `createTextMeasurer`, `createKeymap`,
  `createCommandRegistry`, `createSelectionModel`, `createViewCommands`,
  `createViewEvents`, `createClipboardService`, `createConnectionChoice`,
  `registerBuiltinCommands` (advanced): building blocks for a host that assembles a view
  from parts, the entry's stated purpose.
- All 26 React names and every type that appears in a kept signature: a host writes them.

## Decisions to review

- The 80+ exported types with no outside use on the view entry were kept in full (see
  `design.md`); a stricter pass could remove those not named in any signature.
- `DEFAULT_AUTO_PAN` was removed while `DEFAULT_TOOL_OPTIONS` stays only because the
  contract test names it.
- `core/advanced` for geometry math was not created (no new entry points).

## Gates (5.1)

Lint, typecheck (including examples and benchmarks), `npm test` (195 files, 1162 tests),
`npm run test:browser` (73 files, 362 tests), `npm run build`, `node scripts/consumer-smoke.mjs`
and `openspec validate shrink-public-surface-before-first-release --strict` all exit 0.
