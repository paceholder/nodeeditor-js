import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * The entries export only names a host needs. Names that were judged internal and removed
 * must not come back, and the number of exports per entry may not grow without a decision
 * (raise the ceiling in the same change that adds a name, with its reason).
 */
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const ENTRIES = {
  core: { source: "src/core/index.ts", built: "core/index.js" },
  view: { source: "src/view/index.ts", built: "view/index.js" },
  advanced: { source: "src/view/advanced.ts", built: "view/advanced.js" },
  react: { source: "src/react/index.ts", built: "react/index.js" },
} as const;
type Entry = keyof typeof ENTRIES;

/**
 * Ceilings for every exported name (values and types) and for runtime values alone.
 * Core rose by three names and one value for the submission intent decoder
 * (`decodeIntents`, `Intent`, `IntentKind`), which hosts of an external adapter need to map
 * a submitted patch to store calls.
 * Core rose by twelve names and one value for the snapshot model, the first external
 * adapter a host can use (`createSnapshotModel`, `SnapshotModel`, `SnapshotModelOptions`,
 * `SnapshotHistoryOptions`, `HostAnswer`, `HostHistoryRequest`, `PendingEdit`,
 * `PendingEditState`, `PushOutcome`, `PushResult`, `QueuedPush`, `SyncLogEntry`), and by one
 * name each for the `resync-requested` and `conflict` events it publishes
 * (`ResyncRequestedEvent`, `ConflictEvent`).
 * Core rose by three names for delegated node creation, which a host that names nodes
 * must type: the intent its `onDelegate` callback receives (`DelegatedIntent`; its
 * members are reached by narrowing on `kind`), the option union that turns it on
 * (`SnapshotCreationOptions`) and the placeholder `placeholders()` lists
 * (`CreationPlaceholder`).
 * Core rose by one name for the unconfirmed flag (`UnconfirmedIds`, what the snapshot
 * model's `unconfirmed()` returns): a host that paints or reports unconfirmed entities
 * outside a mounted view reads it directly; the view reads it for its painters.
 * Core rose by two names that the built declarations of `SnapshotModelOptions` refer to
 * (`GraphModelSettings`, `SnapshotAdapterBaseOptions`); without them a consumer's own
 * declaration build can fail with TS2742.
 */
const MAX_NAMES: Record<Entry, number> = {
  core: 310,
  view: 134,
  advanced: 95,
  react: 26,
};
const MAX_VALUES: Record<Entry, number> = {
  core: 109,
  view: 19,
  advanced: 47,
  react: 16,
};

/** Removed as internal: low-level math, record checks, reserved ID kinds, tool internals. */
const REMOVED: Record<Entry, string[]> = {
  core: [
    "checkDpr",
    "checkConnectionEndpoints",
    "checkPortOwnership",
    "defaultLimit",
    "deviceToViewport",
    "groupId",
    "GroupId",
    "ID_KINDS",
    "inflateRect",
    "intersectRects",
    "isFinitePath",
    "isFinitePoint",
    "isFiniteRect",
    "isFiniteSize",
    "isFiniteVec2",
    "isInWorldRange",
    "isQuarterTurns",
    "isValidShape",
    "MAX_WORLD_COORD",
    "memberKey",
    "MemberKey",
    "normalizeRoute",
    "placeholderGeometry",
    "RecordLookup",
    "valueId",
    "ValueId",
  ],
  view: ["DEFAULT_AUTO_PAN"],
  advanced: [
    "applySelectionChange",
    "armedVelocity",
    "attachClipboardEvents",
    "autoPanVelocity",
    "AutoPanArm",
    "choiceOptions",
    "CLIPBOARD_COMMAND_IDS",
    "ClipboardEvents",
    "ClipboardEventsDeps",
    "copiedPlacement",
    "createHiddenIds",
    "createPreviewHost",
    "DEFAULT_PASTE_STEP",
    "detectPlatform",
    "diagnosticsOf",
    "duplicatePlacement",
    "EMPTY_VIEW_STATE",
    "fixedFor",
    "hitsResizeHandle",
    "HiddenIds",
    "INITIAL_PLACEMENT",
    "isEditable",
    "LONG_PRESS_IDLE",
    "LongPressAction",
    "LongPressInput",
    "LongPressState",
    "LongPressStep",
    "longPressStep",
    "PlacementState",
    "pastePlacement",
    "PreviewHost",
    "registerClipboardCommands",
    "registerTransformCommands",
    "RESIZE_HANDLE_ORDER",
    "RESIZE_HANDLE_PX",
    "resizeHandleEntry",
    "ResizeResult",
    "ResizeStart",
    "ResizeState",
    "ResizeStep",
    "resizeStep",
    "resizeTargetOf",
    "sizeLimitsOf",
    "SizeLimitsLookup",
    "startArm",
    "systemClipboardOf",
    "TRANSFORM_COMMAND_IDS",
    "updateArm",
  ],
  react: [],
};

/** Every exported name of each entry, values and types, as the compiler sees them. */
function exportedNames(): Record<Entry, Set<string>> {
  const files = Object.values(ENTRIES).map((e) => join(ROOT, e.source));
  const program = ts.createProgram(files, {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    lib: ["lib.es2022.d.ts", "lib.dom.d.ts"],
    noEmit: true,
    skipLibCheck: true,
    types: [],
  });
  const checker = program.getTypeChecker();
  const out = {} as Record<Entry, Set<string>>;
  for (const [entry, { source }] of Object.entries(ENTRIES) as [
    Entry,
    (typeof ENTRIES)[Entry],
  ][]) {
    const file = program.getSourceFile(join(ROOT, source));
    const symbol = file && checker.getSymbolAtLocation(file);
    if (!symbol) throw new Error(`no module symbol for ${source}`);
    out[entry] = new Set(
      checker.getExportsOfModule(symbol).map((s) => s.getName()),
    );
  }
  return out;
}

let out = "";
const values = {} as Record<Entry, string[]>;

beforeAll(async () => {
  out = mkdtempSync(join(tmpdir(), "nodeeditor-surface-"));
  execFileSync("npx", ["tsup", "--no-dts", "--out-dir", out], {
    stdio: "ignore",
  });
  for (const [entry, { built }] of Object.entries(ENTRIES) as [
    Entry,
    (typeof ENTRIES)[Entry],
  ][]) {
    const mod = (await import(pathToFileURL(join(out, built)).href)) as Record<
      string,
      unknown
    >;
    values[entry] = Object.keys(mod);
  }
}, 120_000);

afterAll(() => {
  if (out) rmSync(out, { recursive: true, force: true });
});

const NAMES = exportedNames();
const entries = Object.keys(ENTRIES) as Entry[];

describe("public surface", () => {
  it("names judged internal and removed do not come back to any entry", () => {
    for (const entry of entries) {
      expect(
        REMOVED[entry].filter((n) => NAMES[entry].has(n)),
        `${entry} declarations`,
      ).toEqual([]);
      expect(
        REMOVED[entry].filter((n) => values[entry]?.includes(n)),
        `${entry} built output`,
      ).toEqual([]);
    }
  });

  it("the number of exported names per entry stays at or below the settled ceiling", () => {
    for (const entry of entries) {
      expect(NAMES[entry].size, entry).toBeLessThanOrEqual(MAX_NAMES[entry]);
    }
  });

  it("the number of runtime values in each built entry stays at or below the settled ceiling", () => {
    for (const entry of entries) {
      expect(values[entry]?.length ?? 0, entry).toBeLessThanOrEqual(
        MAX_VALUES[entry],
      );
    }
  });
});
