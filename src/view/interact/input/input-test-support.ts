/**
 * Browser-test helpers that drive a view through real DOM events. Coordinates are world
 * points; they are mapped to client positions from the live element rect and viewport, so
 * the tests do not depend on the implementation's own coordinate code.
 */
import type { ViewHandle } from "../../mount-view.js";

export interface Mods {
  readonly shift?: boolean;
  readonly alt?: boolean;
  readonly ctrl?: boolean;
  readonly meta?: boolean;
}

export function clientOf(
  view: ViewHandle,
  wx: number,
  wy: number,
): { x: number; y: number } {
  const rect = view.element.getBoundingClientRect();
  const vp = view.viewport.get();
  return {
    x: rect.left + vp.panX + wx * vp.zoom,
    y: rect.top + vp.panY + wy * vp.zoom,
  };
}

function pointer(
  target: EventTarget,
  type: string,
  at: { x: number; y: number },
  init: PointerEventInit = {},
): PointerEvent {
  const event = new PointerEvent(type, {
    pointerId: 1,
    pointerType: "mouse",
    isPrimary: true,
    clientX: at.x,
    clientY: at.y,
    bubbles: true,
    cancelable: true,
    composed: true,
    ...init,
  });
  target.dispatchEvent(event);
  return event;
}

/** A pointer driven at world coordinates. */
export function mouse(view: ViewHandle, target: EventTarget = view.element) {
  const at = (wx: number, wy: number) => clientOf(view, wx, wy);
  const mods = (m: Mods): PointerEventInit => ({
    shiftKey: m.shift === true,
    altKey: m.alt === true,
    ctrlKey: m.ctrl === true,
    metaKey: m.meta === true,
  });
  // Held buttons as a DOM `buttons` mask, as a real mouse reports them on every event.
  const BIT = [1, 4, 2] as const;
  let held = 0;
  const down = (wx: number, wy: number, m: Mods = {}, button = 0) => {
    held |= BIT[button] ?? 0;
    return pointer(target, "pointerdown", at(wx, wy), {
      ...mods(m),
      button,
      buttons: held,
    });
  };
  const move = (wx: number, wy: number, m: Mods = {}) =>
    pointer(target, "pointermove", at(wx, wy), { ...mods(m), buttons: held });
  const up = (wx: number, wy: number, m: Mods = {}, button = 0) => {
    held &= ~(BIT[button] ?? 0);
    return pointer(target, "pointerup", at(wx, wy), {
      ...mods(m),
      button,
      buttons: held,
    });
  };
  return {
    down,
    move,
    up,
    /** Press, move in `steps` equal steps, release at `to`. */
    drag(
      from: readonly [number, number],
      to: readonly [number, number],
      m: Mods = {},
      steps = 6,
    ) {
      down(from[0], from[1], m);
      for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        move(
          from[0] + (to[0] - from[0]) * t,
          from[1] + (to[1] - from[1]) * t,
          m,
        );
      }
      up(to[0], to[1], m);
    },
  };
}

export function key(
  target: EventTarget,
  name: string,
  m: Mods & { composing?: boolean; repeat?: boolean; code?: string } = {},
  type: "keydown" | "keyup" = "keydown",
): KeyboardEvent {
  const event = new KeyboardEvent(type, {
    key: name,
    repeat: m.repeat === true,
    ...(m.code ? { code: m.code } : {}),
    shiftKey: m.shift === true,
    altKey: m.alt === true,
    ctrlKey: m.ctrl === true,
    metaKey: m.meta === true,
    isComposing: m.composing === true,
    keyCode: m.composing ? 229 : 0,
    bubbles: true,
    cancelable: true,
    composed: true,
  });
  target.dispatchEvent(event);
  return event;
}

export function wheel(
  view: ViewHandle,
  wx: number,
  wy: number,
  deltaY: number,
  m: Mods = {},
): WheelEvent {
  const at = clientOf(view, wx, wy);
  const event = new WheelEvent("wheel", {
    clientX: at.x,
    clientY: at.y,
    deltaY,
    ctrlKey: m.ctrl === true,
    bubbles: true,
    cancelable: true,
    composed: true,
  });
  view.element.dispatchEvent(event);
  return event;
}

/** A native `contextmenu` at a world point, as a right-click or Ctrl+click sends. */
export function contextMenu(
  view: ViewHandle,
  wx: number,
  wy: number,
  init: PointerEventInit = {},
  target: EventTarget = view.element,
): PointerEvent {
  const at = clientOf(view, wx, wy);
  const event = new PointerEvent("contextmenu", {
    clientX: at.x,
    clientY: at.y,
    button: 2,
    pointerType: "mouse",
    bubbles: true,
    cancelable: true,
    composed: true,
    ...init,
  });
  target.dispatchEvent(event);
  return event;
}

/** A finger at world points (pointer 7). */
export function touch(view: ViewHandle) {
  const init = { pointerId: 7, pointerType: "touch", isPrimary: true };
  const at = (x: number, y: number) => clientOf(view, x, y);
  return {
    down: (x: number, y: number) =>
      pointer(view.element, "pointerdown", at(x, y), {
        ...init,
        button: 0,
        buttons: 1,
      }),
    move: (x: number, y: number) =>
      pointer(view.element, "pointermove", at(x, y), { ...init, buttons: 1 }),
    up: (x: number, y: number) =>
      pointer(view.element, "pointerup", at(x, y), { ...init, buttons: 0 }),
    native: (x: number, y: number) => contextMenu(view, x, y, init),
  };
}
