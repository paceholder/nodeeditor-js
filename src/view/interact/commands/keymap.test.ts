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
  it("delete and backspace delete the selection", () => {
    expect(command(other, key("Delete"))).toBe(COMMAND_IDS.delete);
    expect(command(mac, key("Backspace"))).toBe(COMMAND_IDS.delete);
  });

  it("undo uses the platform modifier", () => {
    expect(command(mac, key("z", { metaKey: true }))).toBe(COMMAND_IDS.undo);
    expect(command(mac, key("z", { ctrlKey: true }))).toBeUndefined();
    expect(command(other, key("z", { ctrlKey: true }))).toBe(COMMAND_IDS.undo);
    expect(command(other, key("z", { metaKey: true }))).toBeUndefined();
  });

  it("both redo chords work", () => {
    expect(command(other, key("Z", { ctrlKey: true, shiftKey: true }))).toBe(
      COMMAND_IDS.redo,
    );
    expect(command(other, key("y", { ctrlKey: true }))).toBe(COMMAND_IDS.redo);
    expect(command(mac, key("Z", { metaKey: true, shiftKey: true }))).toBe(
      COMMAND_IDS.redo,
    );
    expect(command(mac, key("y", { ctrlKey: true }))).toBe(COMMAND_IDS.redo);
  });

  it("select all and Escape", () => {
    expect(command(other, key("a", { ctrlKey: true }))).toBe(
      COMMAND_IDS.selectAll,
    );
    expect(command(other, key("Escape"))).toBe(COMMAND_IDS.clearSelection);
  });

  it("arrows nudge by the step, Shift by ten steps, one command per press", () => {
    expect(other.resolve(key("ArrowRight"), 20)).toEqual({
      command: COMMAND_IDS.nudge,
      args: { dx: 20, dy: 0 },
      native: false,
      repeat: false,
    });
    expect(other.resolve(key("ArrowUp", { shiftKey: true }), 1)).toEqual({
      command: COMMAND_IDS.nudge,
      args: { dx: 0, dy: -10 },
      native: false,
      repeat: false,
    });
  });

  it("unbound keys and extra modifiers resolve to nothing", () => {
    expect(command(other, key("q"))).toBeUndefined();
    expect(command(other, key("z", { ctrlKey: true, altKey: true }))).toBe(
      undefined,
    );
    expect(command(other, key("Delete", { ctrlKey: true }))).toBeUndefined();
  });

  it("hosts can replace the bindings", () => {
    const custom = createKeymap("other", [
      { chord: "F", command: "view.fitAll" },
    ]);
    expect(command(custom, key("f"))).toBe("view.fitAll");
    expect(command(custom, key("Delete"))).toBeUndefined();
  });

  it("copy, cut, paste and duplicate use the platform modifier", () => {
    const chords = [
      ["c", COMMAND_IDS.copy, true],
      ["x", COMMAND_IDS.cut, true],
      ["v", COMMAND_IDS.paste, true],
      ["d", COMMAND_IDS.duplicate, false],
    ] as const;
    for (const [k, id, native] of chords) {
      // Duplicate acts once per press; the clipboard chords are the browser's.
      const repeat = id !== COMMAND_IDS.duplicate;
      expect(mac.resolve(key(k, { metaKey: true }), 1)).toEqual({
        command: id,
        args: undefined,
        native,
        repeat,
      });
      expect(other.resolve(key(k, { ctrlKey: true }), 1)).toEqual({
        command: id,
        args: undefined,
        native,
        repeat,
      });
    }
    expect(command(mac, key("c", { ctrlKey: true }))).toBeUndefined();
    expect(command(other, key("c", { metaKey: true }))).toBeUndefined();
  });

  it("platform detection is injected and tolerant of a missing navigator", () => {
    expect(detectPlatform({ platform: "MacIntel" })).toBe("mac");
    expect(detectPlatform({ platform: "Win32" })).toBe("other");
    expect(detectPlatform(undefined)).toBe("other");
  });
});

describe("rotate and mirror keys", () => {
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

describe("shortcuts on non-Latin layouts", () => {
  it("the physical key matches when the character is not an ASCII letter or digit", () => {
    // Cyrillic layout: the Z key produces "я", the D key "в", the 1 key stays "1".
    expect(command(other, key("я", { code: "KeyZ", ctrlKey: true }))).toBe(
      COMMAND_IDS.undo,
    );
    expect(command(mac, key("я", { code: "KeyZ", metaKey: true }))).toBe(
      COMMAND_IDS.undo,
    );
    expect(
      command(other, key("Я", { code: "KeyZ", ctrlKey: true, shiftKey: true })),
    ).toBe(COMMAND_IDS.redo);
    expect(command(other, key("в", { code: "KeyD", ctrlKey: true }))).toBe(
      COMMAND_IDS.duplicate,
    );
    // Single-letter shortcuts too: R rotates on a Greek layout ("ρ").
    expect(command(other, key("ρ", { code: "KeyR" }))).toBe(COMMAND_IDS.rotate);
  });

  it("a key that produces an ASCII letter matches by that character, not by its position", () => {
    // AZERTY: the key in the QWERTY W position produces "z".
    expect(command(other, key("z", { code: "KeyW", ctrlKey: true }))).toBe(
      COMMAND_IDS.undo,
    );
    // The QWERTY Z position produces "w" there: no undo.
    expect(
      command(other, key("w", { code: "KeyZ", ctrlKey: true })),
    ).toBeUndefined();
    // Named keys are untouched by the fallback.
    expect(command(other, key("Delete", { code: "Delete" }))).toBe(
      COMMAND_IDS.delete,
    );
  });
});

describe("one step per held key", () => {
  it("nudge, rotate, mirror and duplicate bindings say repeats do not run; undo repeats", () => {
    const repeat = (e: KeyLike) => other.resolve(e, 1)?.repeat;
    expect(repeat(key("ArrowLeft"))).toBe(false);
    expect(repeat(key("ArrowDown", { shiftKey: true }))).toBe(false);
    expect(repeat(key("r"))).toBe(false);
    expect(repeat(key("m", { shiftKey: true }))).toBe(false);
    expect(repeat(key("d", { ctrlKey: true }))).toBe(false);
    expect(repeat(key("z", { ctrlKey: true }))).toBe(true);
    // A host binding repeats unless it says otherwise.
    const host = createKeymap("other", [{ chord: "X", command: "host.x" }]);
    expect(host.resolve(key("x"), 1)?.repeat).toBe(true);
  });
});

describe("native clipboard bindings are only for copy, cut and paste", () => {
  it("the default copy, cut and paste chords resolve as native", () => {
    for (const k of ["c", "x", "v"]) {
      expect(other.resolve(key(k, { ctrlKey: true }), 1)?.native).toBe(true);
    }
  });

  it("a native mark on any other command is ignored", () => {
    const m = createKeymap("other", [
      { chord: "Mod+Z", command: COMMAND_IDS.undo, native: true },
      { chord: "Mod+D", command: "host.duplicate", native: true },
    ]);
    expect(m.resolve(key("z", { ctrlKey: true }), 1)).toMatchObject({
      command: COMMAND_IDS.undo,
      native: false,
    });
    expect(m.resolve(key("d", { ctrlKey: true }), 1)?.native).toBe(false);
  });
});
