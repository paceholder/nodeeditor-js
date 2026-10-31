/**
 * DOM event to `ToolInput` conversion: modifier mapping with the
 * platform's primary key, pointer types, and the pointer-event builder. Pure apart from
 * reading event fields; the DOM input adapter owns listeners and effects.
 */
import type { Point } from "../../../core/index.js";
import type {
  Modifiers,
  PointerInput,
  PointerType,
} from "../tools/tool-types.js";

/** Buttons tools understand: primary, middle, secondary. */
export const BUTTONS: ReadonlySet<number> = new Set([0, 1, 2]);

/** The modifier fields of a DOM mouse, pointer, wheel or keyboard event. */
export interface ModifierKeys {
  readonly shiftKey: boolean;
  readonly altKey: boolean;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
}

/** `mod` is Cmd on macOS and Ctrl elsewhere. */
export function modifiersOf(
  e: ModifierKeys,
  platform: "mac" | "other",
): Modifiers {
  return {
    shift: e.shiftKey,
    alt: e.altKey,
    mod: platform === "mac" ? e.metaKey : e.ctrlKey,
  };
}

export function pointerTypeOf(e: PointerEvent): PointerType | undefined {
  return e.pointerType === "mouse" ||
    e.pointerType === "touch" ||
    e.pointerType === "pen"
    ? e.pointerType
    : undefined;
}

/** A tool pointer input for a DOM pointer event at already-converted points. */
export function pointerInputOf(
  type: PointerInput["type"],
  e: PointerEvent,
  at: { readonly viewport: Point<"viewport">; readonly world: Point<"world"> },
  platform: "mac" | "other",
): PointerInput {
  const pointerType = pointerTypeOf(e);
  const base = {
    pointerId: e.pointerId,
    button: BUTTONS.has(e.button) ? (e.button as 0 | 1 | 2) : 0,
    viewport: at.viewport,
    world: at.world,
    modifiers: modifiersOf(e, platform),
    time: e.timeStamp,
    ...(pointerType ? { pointerType } : {}),
  } as const;
  return type === "pointer-down"
    ? { type, ...base }
    : type === "pointer-move"
      ? { type, ...base }
      : { type, ...base };
}
