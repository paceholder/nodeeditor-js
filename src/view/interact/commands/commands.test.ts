import { describe, expect, it } from "vitest";
import { connectionId, nodeId } from "../../../core/index.js";
import {
  cornerNode,
  createToolHarness,
  type HarnessOptions,
} from "../../test-support/tool-harness.js";
import { connectionKey, nodeKey } from "../selection/selection-model.js";
import { COMMAND_IDS, registerBuiltinCommands } from "./builtin-commands.js";
import { createCommandRegistry } from "./command-registry.js";
import { createViewCommands } from "./view-commands.js";

function setup(opts: HarnessOptions = {}) {
  const h = createToolHarness(opts);
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
  const commands = createCommandRegistry(() => ({
    model: h.model,
    reader: h.model.reader,
    selection: h.selection,
    view,
  }));
  registerBuiltinCommands(commands);
  return { h, commands, viewport: () => viewport };
}

const trio = (): HarnessOptions => ({
  nodes: [cornerNode("a", 0, 0), cornerNode("b", 200, 0)],
  connections: [["c1", "a", "aR", "b", "bL"]],
});

describe("builtin commands", () => {
  it("INT-07 every built-in command is listed with a localizable label key", () => {
    const { commands } = setup(trio());
    const ids = commands.list().map((c) => c.id);
    expect(ids).toEqual(Object.values(COMMAND_IDS));
    expect(
      commands.list().every((c) => c.labelKey.startsWith("command.")),
    ).toBe(true);
  });

  it("INT-07, MOD-11 edit.delete reports unavailable with a capability reason for a locked-only selection", () => {
    const { h, commands } = setup({
      ...trio(),
      modelOptions: {
        capabilityPolicy: {
          decide: (action) => (action === "delete" ? false : undefined),
        },
      },
    });
    h.selection.replace([nodeKey(nodeId("a"))]);
    const a = commands.availability(COMMAND_IDS.delete);
    expect(a.available).toBe(false);
    if (!a.available) expect(a.reason.code).toBe("capability-denied");
    const r = commands.run(COMMAND_IDS.delete);
    expect(r.ok).toBe(false);
    expect(h.model.reader.nodes()).toHaveLength(2);
  });

  it("INT-07 edit.delete is unavailable with nothing selected and deletes incident connections otherwise", () => {
    const { h, commands } = setup(trio());
    expect(commands.availability(COMMAND_IDS.delete).available).toBe(false);
    h.selection.replace([nodeKey(nodeId("a"))]);
    expect(commands.run(COMMAND_IDS.delete)).toEqual({
      ok: true,
      value: { changed: true },
    });
    expect(h.model.reader.nodes().map((n) => n.id)).toEqual(["b"]);
    expect(h.model.reader.connections()).toHaveLength(0);
    // The deleted entities leave the selection with the model change.
    expect(h.selection.size).toBe(0);
  });

  it("INT-07 a shortcut-equivalent run and an API call produce identical patches on equal models", () => {
    const viaCommand = setup(trio());
    const viaApi = setup(trio());
    viaCommand.h.selection.replace([connectionKey(connectionId("c1"))]);
    const seen: unknown[][] = [[], []];
    viaCommand.h.model.on("change", (e) => seen[0]?.push(e.patch));
    viaApi.h.model.on("change", (e) => seen[1]?.push(e.patch));
    viaCommand.commands.run(COMMAND_IDS.delete);
    viaApi.h.model.execute({
      kind: "deleteEntities",
      connections: [connectionId("c1")],
    });
    expect(seen[0]).toHaveLength(1);
    expect(seen[0]).toEqual(seen[1]);
  });

  it("INT-07 undo and redo run through the same registry and report availability", () => {
    const { h, commands } = setup(trio());
    expect(commands.availability(COMMAND_IDS.redo).available).toBe(false);
    h.selection.replace([nodeKey(nodeId("a"))]);
    commands.run(COMMAND_IDS.delete);
    expect(commands.run(COMMAND_IDS.undo).ok).toBe(true);
    expect(h.model.reader.nodes()).toHaveLength(2);
    expect(commands.availability(COMMAND_IDS.redo).available).toBe(true);
    expect(commands.run(COMMAND_IDS.redo).ok).toBe(true);
    expect(h.model.reader.nodes()).toHaveLength(1);
  });

  it("INT-07 nodes.nudge is one move command and skips locked nodes", () => {
    const { h, commands } = setup({
      nodes: [cornerNode("a", 0, 0), cornerNode("b", 100, 0)],
      modelOptions: {
        capabilityPolicy: {
          decide: (action, node) =>
            action === "move" && node.id === "b" ? false : undefined,
        },
      },
    });
    h.selection.replace([nodeKey(nodeId("a")), nodeKey(nodeId("b"))]);
    let changes = 0;
    h.model.on("change", () => changes++);
    expect(commands.run(COMMAND_IDS.nudge, { dx: 5, dy: 0 }).ok).toBe(true);
    expect(changes).toBe(1);
    expect(h.model.reader.getNode(nodeId("a"))?.position).toEqual({
      x: 25,
      y: 10,
    });
    expect(h.model.reader.getNode(nodeId("b"))?.position).toEqual({
      x: 120,
      y: 10,
    });
    expect(commands.run(COMMAND_IDS.nudge, { dx: Number.NaN, dy: 0 }).ok).toBe(
      false,
    );
  });

  it("INT-07 selection and view commands act on view-local state only", () => {
    const { h, commands, viewport } = setup(trio());
    const rev = h.model.reader.revision();
    commands.run(COMMAND_IDS.selectAll);
    expect(h.selection.size).toBe(3);
    expect(commands.run(COMMAND_IDS.fitAll).ok).toBe(true);
    expect(viewport().zoom).not.toBe(1);
    commands.run(COMMAND_IDS.clearSelection);
    expect(h.selection.size).toBe(0);
    expect(commands.run(COMMAND_IDS.reveal, nodeId("b")).ok).toBe(true);
    expect(h.model.reader.revision()).toBe(rev);
  });

  it("INT-07 an unknown command ID is a result, not a throw", () => {
    const { commands } = setup(trio());
    const r = commands.run("no.such.command");
    expect(r.ok).toBe(false);
  });
});
