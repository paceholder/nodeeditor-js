import { describe, expect, it } from "vitest";
import { COMMAND_IDS } from "./builtin-commands.js";
import { createKeymap, detectPlatform, type KeyLike } from "./keymap.js";

const key = (k: string, mods: Partial<KeyLike> = {}): KeyLike => ({
  key: k,
  ctrlKey: false,
  metaKey: false,
  shiftKey: false,
  altKey: false,
  ...mods,
});

const mac = createKeymap("mac");
const other = createKeymap("other");
const command = (m: ReturnType<typeof createKeymap>, e: KeyLike, step = 1) =>
  m.resolve(e, step)?.command;

describe("default keymap", () => {
  it("UX-01 delete and backspace delete the selection", () => {
    expect(command(other, key("Delete"))).toBe(COMMAND_IDS.delete);
    expect(command(mac, key("Backspace"))).toBe(COMMAND_IDS.delete);
  });

  it("UX-01 undo uses the platform modifier", () => {
    expect(command(mac, key("z", { metaKey: true }))).toBe(COMMAND_IDS.undo);
    expect(command(mac, key("z", { ctrlKey: true }))).toBeUndefined();
    expect(command(other, key("z", { ctrlKey: true }))).toBe(COMMAND_IDS.undo);
    expect(command(other, key("z", { metaKey: true }))).toBeUndefined();
  });

  it("UX-01 both redo chords work", () => {
    expect(command(other, key("Z", { ctrlKey: true, shiftKey: true }))).toBe(
      COMMAND_IDS.redo,
    );
    expect(command(other, key("y", { ctrlKey: true }))).toBe(COMMAND_IDS.redo);
    expect(command(mac, key("Z", { metaKey: true, shiftKey: true }))).toBe(
      COMMAND_IDS.redo,
    );
    expect(command(mac, key("y", { ctrlKey: true }))).toBe(COMMAND_IDS.redo);
  });

  it("UX-01 select all and Escape", () => {
    expect(command(other, key("a", { ctrlKey: true }))).toBe(
      COMMAND_IDS.selectAll,
    );
    expect(command(other, key("Escape"))).toBe(COMMAND_IDS.clearSelection);
  });

  it("UX-01 arrows nudge by the step, Shift by ten steps, one command per press", () => {
    expect(other.resolve(key("ArrowRight"), 20)).toEqual({
      command: COMMAND_IDS.nudge,
      args: { dx: 20, dy: 0 },
      native: false,
    });
    expect(other.resolve(key("ArrowUp", { shiftKey: true }), 1)).toEqual({
      command: COMMAND_IDS.nudge,
      args: { dx: 0, dy: -10 },
      native: false,
    });
  });

  it("UX-01 unbound keys and extra modifiers resolve to nothing", () => {
    expect(command(other, key("q"))).toBeUndefined();
    expect(command(other, key("z", { ctrlKey: true, altKey: true }))).toBe(
      undefined,
    );
    expect(command(other, key("Delete", { ctrlKey: true }))).toBeUndefined();
  });

  it("UX-01 hosts can replace the bindings", () => {
    const custom = createKeymap("other", [
      { chord: "F", command: "view.fitAll" },
    ]);
    expect(command(custom, key("f"))).toBe("view.fitAll");
    expect(command(custom, key("Delete"))).toBeUndefined();
  });

  it("UX-01 copy, cut, paste and duplicate use the platform modifier", () => {
    const chords = [
      ["c", COMMAND_IDS.copy, true],
      ["x", COMMAND_IDS.cut, true],
      ["v", COMMAND_IDS.paste, true],
      ["d", COMMAND_IDS.duplicate, false],
    ] as const;
    for (const [k, id, native] of chords) {
      expect(mac.resolve(key(k, { metaKey: true }), 1)).toEqual({
        command: id,
        args: undefined,
        native,
      });
      expect(other.resolve(key(k, { ctrlKey: true }), 1)).toEqual({
        command: id,
        args: undefined,
        native,
      });
    }
    expect(command(mac, key("c", { ctrlKey: true }))).toBeUndefined();
    expect(command(other, key("c", { metaKey: true }))).toBeUndefined();
  });

  it("UX-01 platform detection is injected and tolerant of a missing navigator", () => {
    expect(detectPlatform({ platform: "MacIntel" })).toBe("mac");
    expect(detectPlatform({ platform: "Win32" })).toBe("other");
    expect(detectPlatform(undefined)).toBe("other");
  });
});

describe("UX-01 rotate and mirror keys", () => {
  const resolve = (m: ReturnType<typeof createKeymap>, e: KeyLike) =>
    m.resolve(e, 1);

  it("R, Shift+R, M and Shift+M resolve to their commands on both platforms", () => {
    for (const m of [mac, other]) {
      expect(resolve(m, key("r"))).toMatchObject({
        command: COMMAND_IDS.rotate,
        args: { turns: 1 },
      });
      expect(resolve(m, key("R", { shiftKey: true }))).toMatchObject({
        command: COMMAND_IDS.rotate,
        args: { turns: -1 },
      });
      expect(resolve(m, key("m"))).toMatchObject({
        command: COMMAND_IDS.mirror,
        args: { axis: "horizontal" },
      });
      expect(resolve(m, key("M", { shiftKey: true }))).toMatchObject({
        command: COMMAND_IDS.mirror,
        args: { axis: "vertical" },
      });
    }
  });

  it("Mod+R resolves to nothing, so the browser reload stays available", () => {
    expect(resolve(mac, key("r", { metaKey: true }))).toBeUndefined();
    expect(resolve(other, key("r", { ctrlKey: true }))).toBeUndefined();
    expect(resolve(other, key("r", { altKey: true }))).toBeUndefined();
  });
});
