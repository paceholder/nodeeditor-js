import { describe, expect, it } from "vitest";
import { nodeId, rejectionOf } from "../../../core/index.js";
import { twoPortNode } from "../../../core/space/scene/scene-fixtures.js";
import { createCommandRegistry } from "../commands/command-registry.js";
import { nodeKey } from "../selection/selection-model.js";
import {
  CLIPBOARD_COMMAND_IDS,
  registerClipboardCommands,
} from "./clipboard-commands.js";
import {
  clipboardModel,
  clipboardSetup,
  fakeSystem,
} from "./clipboard-fixtures.js";
import type { PasteOutcome } from "./clipboard-service.js";

const selectBoth = (s: ReturnType<typeof clipboardSetup>) =>
  s.selection.replace([nodeKey(nodeId("a")), nodeKey(nodeId("b"))]);

const created = (o: PasteOutcome) => (o.ok ? o.value.created : undefined);

describe("clipboard service: copy, paste, duplicate", () => {
  it("copies to the buffer and the system clipboard, pastes and selects the copy", async () => {
    const fake = fakeSystem();
    const s = clipboardSetup({ system: fake.system });
    selectBoth(s);
    const copied = s.service.copy();
    expect(copied.ok).toBe(true);
    await Promise.resolve();
    expect(fake.text()).toBe(s.service.buffer());
    s.setPointer({ x: 500, y: 500 });
    const pasted = s.service.paste();
    const ids = created(pasted);
    expect(ids?.nodes).toHaveLength(2);
    expect(ids?.connections).toHaveLength(1);
    expect(s.selection.nodeIds()).toEqual(ids?.nodes);
    expect(s.selection.connectionIds()).toEqual(ids?.connections);
    expect(s.model.historyState().undoLabel).toBe("Paste");
  });

  it("pastes without a pointer at one, then two steps", () => {
    const s = clipboardSetup();
    selectBoth(s);
    s.service.copy();
    const xs = [s.service.paste(), s.service.paste()].map((o) => {
      const id = created(o)?.nodes[0];
      return id && s.model.reader.getNode(id)?.position;
    });
    expect(xs).toEqual([
      { x: 20, y: 20 },
      { x: 40, y: 40 },
    ]);
  });

  it("Paste at a given position: centred at `at`, not at the pointer", () => {
    const s = clipboardSetup();
    const noView = () => ({
      ok: false as const,
      error: rejectionOf("unknown-entity", "none"),
    });
    const commands = createCommandRegistry(() => ({
      model: s.model,
      reader: s.model.reader,
      selection: s.selection,
      view: {
        fitAll: noView,
        fitSelection: noView,
        resetView: noView,
        reveal: noView,
      },
    }));
    registerClipboardCommands(commands, s.service);
    selectBoth(s);
    s.service.copy();
    s.setPointer({ x: 500, y: 500 });
    const run = commands.run(CLIPBOARD_COMMAND_IDS.paste, {
      at: { x: 300, y: 300 },
    });
    expect(run.ok).toBe(true);
    const [first, second] = s.selection.nodeIds();
    const at = (id: typeof first) => id && s.model.reader.getNode(id)?.position;
    // The fragment a (0, 0) and b (100, 0) has its bounding-box centre at (50, 0).
    expect([at(first), at(second)]).toEqual([
      { x: 250, y: 300 },
      { x: 350, y: 300 },
    ]);
    expect(s.model.historyState().undoLabel).toBe("Paste");
  });

  it("duplicates one step away and selects the copy", () => {
    const s = clipboardSetup();
    s.selection.replace([nodeKey(nodeId("b"))]);
    const ids = created(s.service.duplicate());
    const copy = ids?.nodes[0];
    expect(copy && s.model.reader.getNode(copy)?.position).toEqual({
      x: 120,
      y: 20,
    });
    expect(s.selection.nodeIds()).toEqual(ids?.nodes);
    expect(s.service.buffer()).toBeUndefined();
  });
});

describe("excluded references are reported", () => {
  it("reports an external connection on copy and paste", () => {
    const s = clipboardSetup();
    s.selection.replace([nodeKey(nodeId("a"))]);
    const events: PasteOutcome[] = [];
    s.service.on("paste", (e) => events.push(e));
    const copied = s.service.copy();
    expect(copied.ok && copied.value.excluded).toEqual([
      { connection: "c1", reason: "external" },
    ]);
    const pasted = s.service.paste();
    expect(pasted.ok && pasted.value.excluded).toEqual([
      { connection: "c1", reason: "external" },
    ]);
    expect(events).toEqual([pasted]);
  });
});

describe("clipboard fallback and foreign text", () => {
  it("Clipboard denied: export and import still work, the failure is an event", async () => {
    const s = clipboardSetup({ system: fakeSystem(true).system });
    const errors: string[] = [];
    s.service.on("clipboard-error", (e) => errors.push(e.code));
    selectBoth(s);
    s.service.copy();
    await new Promise((r) => setTimeout(r, 0));
    expect(errors).toEqual(["clipboard-unavailable"]);
    const read = await s.service.pasteFromSystem();
    expect(!read.ok && read.error.code).toBe("clipboard-unavailable");
    const text = s.service.exportText();
    expect(text.ok).toBe(true);
    const target = clipboardSetup({ model: clipboardModel([], []) });
    const imported = target.service.importText(text.ok ? text.value : "");
    expect(created(imported)?.nodes).toHaveLength(2);
  });

  it("Foreign clipboard text: not-a-fragment, nothing pasted, buffer not used", () => {
    const s = clipboardSetup();
    selectBoth(s);
    s.service.copy();
    const revision = s.model.revision();
    const r = s.service.paste("just some words");
    expect(!r.ok && r.error.code).toBe("not-a-fragment");
    expect(s.model.revision()).toBe(revision);
  });

  it("pastes from the system clipboard", async () => {
    const fake = fakeSystem();
    const source = clipboardSetup();
    selectBoth(source);
    const text = source.service.exportText();
    fake.set(text.ok ? text.value : "");
    const s = clipboardSetup({
      model: clipboardModel([], []),
      system: fake.system,
    });
    const r = await s.service.pasteFromSystem();
    expect(created(r)?.nodes).toHaveLength(2);
  });
});

describe("cut", () => {
  it("cuts as one history entry and keeps the fragment in the buffer", () => {
    const s = clipboardSetup();
    selectBoth(s);
    const r = s.service.cut();
    expect(r.ok).toBe(true);
    expect(s.model.reader.nodes()).toHaveLength(0);
    expect(s.model.historyState().undoLabel).toBe("Delete");
    s.model.undo();
    expect(s.model.reader.nodes().map((n) => n.id)).toEqual(["a", "b"]);
    expect(s.model.historyState().canUndo).toBe(false);
    expect(s.service.buffer()).toBe(r.ok ? r.value.text : "");
  });

  it("a rejected cut leaves the buffer unchanged", () => {
    const model = clipboardModel(
      [twoPortNode("a", 0, 0), twoPortNode("b", 100, 0)],
      [],
      {
        capabilityPolicy: {
          decide: (a) => (a === "delete" ? false : undefined),
        },
      },
    );
    const s = clipboardSetup({ model });
    s.selection.replace([nodeKey(nodeId("a"))]);
    s.service.copy();
    const before = s.service.buffer();
    selectBoth(s);
    const r = s.service.cut();
    expect(!r.ok && r.error.code).toBe("capability-denied");
    expect(s.service.buffer()).toBe(before);
    expect(s.model.reader.nodes()).toHaveLength(2);
  });
});
