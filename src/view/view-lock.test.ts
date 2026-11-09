import { describe, expect, it } from "vitest";
import { nodeId } from "../core/index.js";
import { createClipboardService } from "./interact/clipboard/clipboard-service.js";
import {
  COMMAND_IDS,
  registerBuiltinCommands,
} from "./interact/commands/builtin-commands.js";
import { createCommandRegistry } from "./interact/commands/command-registry.js";
import { createViewCommands } from "./interact/commands/view-commands.js";
import { createViewLock, VIEW_LOCKED } from "./interact/lock/view-lock.js";
import { nodeKey } from "./interact/selection/selection-model.js";
import { cornerNode, createToolHarness } from "./test-support/tool-harness.js";

function setup() {
  const h = createToolHarness({
    nodes: [cornerNode("a", 0, 0), cornerNode("b", 200, 0)],
    connections: [["c1", "a", "aR", "b", "bL"]],
  });
  const lock = createViewLock();
  let viewport = { zoom: 1, panX: 0, panY: 0 };
  const view = createViewCommands({
    reader: h.model.reader,
    scene: h.scene,
    selection: h.selection,
    viewport: {
      get: () => viewport,
      set: (v) => {
        viewport = v;
        return { ok: true, value: v };
      },
    },
    size: () => ({ width: 800, height: 600 }),
  });
  const commands = createCommandRegistry(
    () => ({
      model: h.model,
      reader: h.model.reader,
      selection: h.selection,
      view,
    }),
    lock.get,
  );
  const clipboard = createClipboardService({
    reader: h.model.reader,
    model: h.model,
    selection: h.selection,
    locked: lock.get,
    pointer: () => undefined,
    system: undefined,
  });
  registerBuiltinCommands(commands, clipboard);
  h.selection.replace([nodeKey(nodeId("a"))]);
  return { h, commands, clipboard, lock, viewport: () => viewport };
}

const EDITING = [
  COMMAND_IDS.delete,
  COMMAND_IDS.undo,
  COMMAND_IDS.redo,
  COMMAND_IDS.nudge,
  COMMAND_IDS.resetRoute,
  COMMAND_IDS.rotate,
  COMMAND_IDS.mirror,
  COMMAND_IDS.cut,
  COMMAND_IDS.paste,
  COMMAND_IDS.duplicate,
] as const;

const ALLOWED_WHEN_LOCKED = [
  COMMAND_IDS.selectAll,
  COMMAND_IDS.clearSelection,
  COMMAND_IDS.fitAll,
  COMMAND_IDS.zoomIn,
  COMMAND_IDS.zoomOut,
  COMMAND_IDS.fitSelection,
  COMMAND_IDS.resetView,
  COMMAND_IDS.copy,
] as const;

describe("view lock", () => {
  it("a locked view refuses every editing command with the lock reason and changes nothing", () => {
    const { h, commands, lock } = setup();
    const history = h.model.historyState();
    const revision = h.model.reader.revision();
    lock.set(true);
    for (const id of EDITING) {
      const a = commands.availability(
        id,
        id === COMMAND_IDS.nudge ? { dx: 5, dy: 0 } : undefined,
      );
      expect(a.available, id).toBe(false);
      if (!a.available) expect(a.rejection).toEqual(VIEW_LOCKED);
      const r = commands.run(
        id,
        id === COMMAND_IDS.nudge ? { dx: 5, dy: 0 } : undefined,
      );
      expect(r.ok, id).toBe(false);
      if (!r.ok) expect(r.rejection).toEqual(VIEW_LOCKED);
    }
    expect(h.model.reader.revision()).toBe(revision);
    expect(h.model.historyState()).toEqual(history);
    expect(h.model.reader.nodes()).toHaveLength(2);
  });

  it("selection, fit, zoom, reset and copy keep working while locked", () => {
    const { commands, lock, h } = setup();
    lock.set(true);
    for (const id of ALLOWED_WHEN_LOCKED) {
      expect(commands.availability(id).available, id).toBe(true);
    }
    expect(commands.run(COMMAND_IDS.selectAll).ok).toBe(true);
    expect(h.selection.size).toBe(3);
    expect(commands.run(COMMAND_IDS.fitAll).ok).toBe(true);
    expect(commands.run(COMMAND_IDS.copy).ok).toBe(true);
    expect(commands.run(COMMAND_IDS.clearSelection).ok).toBe(true);
    expect(h.selection.size).toBe(0);
  });

  it("the clipboard service refuses paste, cut and duplicate while locked", () => {
    const { clipboard, lock, h } = setup();
    lock.set(true);
    expect(clipboard.canPaste("{}").available).toBe(false);
    expect(clipboard.canDuplicate().available).toBe(false);
    const cut = clipboard.cut();
    expect(cut.ok).toBe(false);
    if (!cut.ok) expect(cut.rejection).toEqual(VIEW_LOCKED);
    const dup = clipboard.duplicate();
    expect(dup.ok).toBe(false);
    expect(h.model.reader.nodes()).toHaveLength(2);
  });

  it("unlocking restores editing, and the lock produces no history entry", () => {
    const { h, commands, lock } = setup();
    const before = h.model.historyState();
    lock.set(true);
    lock.set(false);
    expect(h.model.historyState()).toEqual(before);
    expect(commands.run(COMMAND_IDS.delete).ok).toBe(true);
    expect(h.model.reader.nodes().map((n) => n.id)).toEqual(["b"]);
    expect(h.model.historyState().canUndo).toBe(true);
  });

  it("the lock reports whether a set changed the state", () => {
    const lock = createViewLock(true);
    expect(lock.get()).toBe(true);
    expect(lock.set(true)).toBe(false);
    expect(lock.set(false)).toBe(true);
  });
});
