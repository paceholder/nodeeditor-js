/**
 * Keymap (D9). Chords resolve to command IDs, so a shortcut runs the same
 * command as the API. `Mod` is Cmd on macOS and Ctrl elsewhere; the platform is injected
 * (detection reads `navigator` only when the host asks, never at import: the server rendering safety rule).
 */
import { COMMAND_IDS } from "./builtin-commands.js";

export type Platform = "mac" | "other";

/** The key event fields the keymap reads; a DOM `KeyboardEvent` fits. */
export interface KeyLike {
  readonly key: string;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
  readonly shiftKey: boolean;
  readonly altKey: boolean;
}

export interface KeyBinding {
  /** `Mod+Shift+Z`, `Ctrl+Y`, `Delete`, `ArrowLeft`: `+`-joined modifiers, then a key. */
  readonly chord: string;
  readonly command: string;
  /** Arguments, built from the nudge step (world units) where they need it. */
  readonly args?: (step: number) => unknown;
  /**
   * The browser's own action for this chord carries the command (copy, cut, paste: the
   * native clipboard event runs it), so the key-down is not default-prevented.
   */
  readonly native?: boolean;
}

export interface ResolvedKey {
  readonly command: string;
  readonly args: unknown;
  readonly native: boolean;
}

export interface Keymap {
  resolve(event: KeyLike, step: number): ResolvedKey | undefined;
  readonly bindings: readonly KeyBinding[];
}

const nudge =
  (dx: number, dy: number, scale = 1) =>
  (step: number) => ({
    dx: dx * step * scale,
    dy: dy * step * scale,
  });

export const DEFAULT_KEYMAP: readonly KeyBinding[] = [
  { chord: "Delete", command: COMMAND_IDS.delete },
  { chord: "Backspace", command: COMMAND_IDS.delete },
  { chord: "Mod+Z", command: COMMAND_IDS.undo },
  { chord: "Mod+Shift+Z", command: COMMAND_IDS.redo },
  { chord: "Ctrl+Y", command: COMMAND_IDS.redo },
  { chord: "Mod+A", command: COMMAND_IDS.selectAll },
  { chord: "Escape", command: COMMAND_IDS.clearSelection },
  { chord: "Mod+C", command: COMMAND_IDS.copy, native: true },
  { chord: "Mod+X", command: COMMAND_IDS.cut, native: true },
  { chord: "Mod+V", command: COMMAND_IDS.paste, native: true },
  { chord: "Mod+D", command: COMMAND_IDS.duplicate },
  // Single letters are safe: text fields and IME never reach the keymap.
  { chord: "R", command: COMMAND_IDS.rotate, args: () => ({ turns: 1 }) },
  {
    chord: "Shift+R",
    command: COMMAND_IDS.rotate,
    args: () => ({ turns: -1 }),
  },
  {
    chord: "M",
    command: COMMAND_IDS.mirror,
    args: () => ({ axis: "horizontal" }),
  },
  {
    chord: "Shift+M",
    command: COMMAND_IDS.mirror,
    args: () => ({ axis: "vertical" }),
  },
  ...(["Left", "Right", "Up", "Down"] as const).flatMap((dir) => {
    const dx = dir === "Left" ? -1 : dir === "Right" ? 1 : 0;
    const dy = dir === "Up" ? -1 : dir === "Down" ? 1 : 0;
    return [
      { chord: `Arrow${dir}`, command: COMMAND_IDS.nudge, args: nudge(dx, dy) },
      {
        chord: `Shift+Arrow${dir}`,
        command: COMMAND_IDS.nudge,
        args: nudge(dx, dy, 10),
      },
    ];
  }),
];

export function detectPlatform(
  nav: { readonly platform?: string } | undefined,
): Platform {
  return /mac|iphone|ipad/i.test(nav?.platform ?? "") ? "mac" : "other";
}

interface Chord {
  readonly key: string;
  readonly mod: boolean;
  readonly ctrl: boolean;
  readonly shift: boolean;
  readonly alt: boolean;
}

function parseChord(chord: string): Chord {
  const parts = chord.split("+");
  const key = (parts.pop() ?? "").toLowerCase();
  const has = (name: string): boolean => parts.includes(name);
  return {
    key,
    mod: has("Mod"),
    ctrl: has("Ctrl"),
    shift: has("Shift"),
    alt: has("Alt"),
  };
}

function matches(c: Chord, e: KeyLike, platform: Platform): boolean {
  // `Mod` is the platform's primary key (Cmd or Ctrl); a literal `Ctrl` is always the
  // Control key. On macOS they differ; elsewhere both mean Ctrl and Meta stays up.
  const modifiers =
    platform === "mac"
      ? e.metaKey === c.mod && e.ctrlKey === c.ctrl
      : e.ctrlKey === (c.mod || c.ctrl) && !e.metaKey;
  return (
    modifiers &&
    e.key.toLowerCase() === c.key &&
    e.shiftKey === c.shift &&
    e.altKey === c.alt
  );
}

export function createKeymap(
  platform: Platform,
  bindings: readonly KeyBinding[] = DEFAULT_KEYMAP,
): Keymap {
  const parsed = bindings.map((b) => ({
    binding: b,
    chord: parseChord(b.chord),
  }));
  return {
    bindings,
    resolve(event, step) {
      const hit = parsed.find((p) => matches(p.chord, event, platform));
      return (
        hit && {
          command: hit.binding.command,
          args: hit.binding.args?.(step),
          native: hit.binding.native === true,
        }
      );
    },
  };
}
