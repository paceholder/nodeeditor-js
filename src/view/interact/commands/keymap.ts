/**
 * Keymap (D9). Chords resolve to command IDs, so a shortcut runs the same
 * command as the API. `Mod` is Cmd on macOS and Ctrl elsewhere; the platform is injected
 * (detection reads `navigator` only when the host asks, never at import: the server rendering safety rule).
 */
import { deepFreeze } from "../../platform/deep-freeze.js";
import { COMMAND_IDS } from "./builtin-commands.js";

export type Platform = "mac" | "other";

/** The key event fields the keymap reads; a DOM `KeyboardEvent` fits. */
export interface KeyLike {
  readonly key: string;
  /** The physical key (`KeyZ`, `Digit1`); used when `key` is not an ASCII letter or digit. */
  readonly code?: string;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
  readonly shiftKey: boolean;
  readonly altKey: boolean;
  /** An auto-repeated key-down of a held key. */
  readonly repeat?: boolean;
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
  /**
   * Whether auto-repeated key-downs of a held key run the command again; default true.
   * The default nudge, rotate, mirror and duplicate bindings say false, so holding the
   * key acts once and adds one history entry.
   */
  readonly repeat?: boolean;
}

export interface ResolvedKey {
  readonly command: string;
  readonly args: unknown;
  readonly native: boolean;
  /** Whether a repeated key-down runs it (see `KeyBinding.repeat`). */
  readonly repeat: boolean;
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

export const DEFAULT_KEYMAP: readonly KeyBinding[] = deepFreeze([
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
  { chord: "Mod+D", command: COMMAND_IDS.duplicate, repeat: false },
  // Single letters are safe: text fields and IME never reach the keymap.
  {
    chord: "R",
    command: COMMAND_IDS.rotate,
    args: () => ({ turns: 1 }),
    repeat: false,
  },
  {
    chord: "Shift+R",
    command: COMMAND_IDS.rotate,
    args: () => ({ turns: -1 }),
    repeat: false,
  },
  {
    chord: "M",
    command: COMMAND_IDS.mirror,
    args: () => ({ axis: "horizontal" }),
    repeat: false,
  },
  {
    chord: "Shift+M",
    command: COMMAND_IDS.mirror,
    args: () => ({ axis: "vertical" }),
    repeat: false,
  },
  ...(["Left", "Right", "Up", "Down"] as const).flatMap((dir) => {
    const dx = dir === "Left" ? -1 : dir === "Right" ? 1 : 0;
    const dy = dir === "Up" ? -1 : dir === "Down" ? 1 : 0;
    return [
      {
        chord: `Arrow${dir}`,
        command: COMMAND_IDS.nudge,
        args: nudge(dx, dy),
        repeat: false,
      },
      {
        chord: `Shift+Arrow${dir}`,
        command: COMMAND_IDS.nudge,
        args: nudge(dx, dy, 10),
        repeat: false,
      },
    ];
  }),
]);

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

/**
 * The key a chord is compared with: the produced character, lower-cased. On a non-Latin
 * layout (Cyrillic, Greek) a letter key produces no ASCII letter, so the physical key's
 * letter or digit is used instead; Latin layouts keep matching what the user sees.
 */
function keyOf(e: KeyLike): string {
  const key = e.key.toLowerCase();
  if (key.length !== 1 || /^[a-z0-9]$/.test(key)) return key;
  const physical = /^(?:Key([A-Z])|Digit([0-9]))$/.exec(e.code ?? "");
  return (physical?.[1] ?? physical?.[2] ?? key).toLowerCase();
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
    keyOf(e) === c.key &&
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
          repeat: hit.binding.repeat !== false,
        }
      );
    },
  };
}
