/**
 * DOM triggers of the context-menu event (D4 to D6): the browser's
 * `contextmenu` (right-click, macOS Ctrl+click, pen barrel button), a touch long-press,
 * and the menu key or Shift+F10. Without a listener nothing here acts, so the browser's
 * menu and every gesture behave as before. Attached on mount, removed on dispose.
 */
import {
  type HitCandidate,
  type Point,
  rect,
  viewportToWorld,
  worldToViewport,
} from "../../../core/index.js";
import {
  isOverlayContent,
  isTextTarget,
  shouldHandleKey,
} from "../input/input-scope.js";
import { modifiersOf, pointerTypeOf } from "../input/pointer-input.js";
import type { SelectionModel } from "../selection/selection-model.js";
import { distancePx, dragThreshold } from "../tools/thresholds.js";
import {
  type CancelReason,
  type Modifiers,
  NO_MODIFIERS,
  type PointerType,
  type ToolContext,
} from "../tools/tool-types.js";
import type {
  ContextMenuEvent,
  ContextMenuInvocation,
  ContextMenuTarget,
} from "./context-menu-types.js";
import {
  contextTarget,
  keyboardTarget,
  selectOnOpen,
} from "./context-target.js";
import {
  LONG_PRESS_IDLE,
  type LongPressInput,
  type LongPressState,
  longPressStep,
} from "./long-press.js";

export interface ContextMenuInputDeps {
  readonly overlay: HTMLElement;
  readonly platform: "mac" | "other";
  readonly context: () => ToolContext;
  readonly selection: SelectionModel;
  /** CSS size of the view, for keyboard placement. */
  readonly size: () => { readonly width: number; readonly height: number };
  readonly activePointer: () => number | undefined;
  readonly cancelGesture: (reason: CancelReason) => void;
  /** Whether any context-menu listener is registered. */
  readonly listening: () => boolean;
  readonly emit: (event: ContextMenuEvent) => void;
}

export interface ContextMenuInput {
  dispose(): void;
}

interface Press {
  readonly pointerId: number;
  readonly pointerType: PointerType;
  readonly client: { readonly x: number; readonly y: number };
  dragging: boolean;
}

const MENU_KEY = (e: KeyboardEvent) =>
  e.key === "ContextMenu" || (e.key === "F10" && e.shiftKey);

export function attachContextMenuInput(
  root: HTMLElement,
  deps: ContextMenuInputDeps,
): ContextMenuInput {
  const win = root.ownerDocument.defaultView;
  const doc = root.ownerDocument;
  let press: Press | undefined;
  let longPress: LongPressState = LONG_PRESS_IDLE;
  let timer: number | undefined;
  // Set by a keyboard invocation: the native `contextmenu` the browser sends after it is
  // swallowed, so one key press raises one event.
  let swallowNative = false;

  const foreign = (e: Event) =>
    isOverlayContent(e.target, deps.overlay) || isTextTarget(e.target);

  function viewportToClient(p: Point<"viewport">) {
    const r = root.getBoundingClientRect();
    return { x: r.left + p.x, y: r.top + p.y };
  }

  function raise(
    target: ContextMenuTarget,
    hits: readonly HitCandidate[],
    invocation: ContextMenuInvocation,
    modifiers: Modifiers,
    world: Point<"world">,
  ): void {
    // Select-on-open for pointer and touch invocations only (D3).
    const change =
      invocation === "keyboard"
        ? undefined
        : selectOnOpen(target, deps.selection);
    if (change) deps.selection.apply(change);
    const viewport = worldToViewport(deps.context().viewport, world);
    deps.emit({
      target,
      hits,
      selection: {
        nodes: deps.selection.nodeIds(),
        connections: deps.selection.connectionIds(),
        groups: deps.selection.groupIds(),
      },
      invocation,
      modifiers,
      client: viewportToClient(viewport),
      viewport,
      world,
    });
  }

  /** Pointer invocation at a viewport point: cancel the press, pick, raise. */
  function raiseAt(
    viewport: Point<"viewport">,
    invocation: ContextMenuInvocation,
    modifiers: Modifiers,
  ): void {
    if (deps.activePointer() !== undefined) deps.cancelGesture("context-menu");
    const ctx = deps.context();
    const world = viewportToWorld(ctx.viewport, viewport);
    const hits = ctx.pick(world);
    raise(contextTarget(hits), hits, invocation, modifiers, world);
  }

  function clearTimer(): void {
    if (timer !== undefined) win?.clearTimeout(timer);
    timer = undefined;
  }

  /** Feed the long-press machine and carry out its action. */
  function feed(input: LongPressInput): "fired" | "swallowed" | undefined {
    const options = deps.context().options;
    const next = longPressStep(
      longPress,
      input,
      dragThreshold(options, "touch"),
    );
    const armed = longPress;
    longPress = next.state;
    switch (next.action) {
      case "arm":
        clearTimer();
        if (options.longPressMs !== false && win) {
          timer = win.setTimeout(
            () => void feed({ type: "timeout" }),
            options.longPressMs,
          );
        }
        return undefined;
      case "disarm":
        clearTimer();
        return undefined;
      case "fire":
        clearTimer();
        if (armed.kind === "armed") {
          raiseAt(armed.start, "touch", NO_MODIFIERS);
        }
        return "fired";
      case "swallow":
        return "swallowed";
      case "none":
        return undefined;
    }
  }

  const viewportOf = (e: MouseEvent): Point<"viewport"> => {
    const r = root.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const onPointerDown = (e: PointerEvent): void => {
    if (foreign(e)) return;
    const pointerType = pointerTypeOf(e) ?? "mouse";
    press = {
      pointerId: e.pointerId,
      pointerType,
      client: { x: e.clientX, y: e.clientY },
      dragging: false,
    };
    const enabled =
      deps.listening() && deps.context().options.longPressMs !== false;
    feed({
      type: "down",
      pointerId: e.pointerId,
      pointerType,
      viewport: viewportOf(e),
      enabled,
    });
  };

  const onPointerMove = (e: PointerEvent): void => {
    if (press?.pointerId === e.pointerId && !press.dragging) {
      const limit = dragThreshold(deps.context().options, press.pointerType);
      const moved = distancePx({ x: e.clientX, y: e.clientY }, press.client);
      press.dragging = moved > limit;
    }
    feed({ type: "move", pointerId: e.pointerId, viewport: viewportOf(e) });
  };

  const onPointerEnd = (e: PointerEvent): void => {
    if (press?.pointerId === e.pointerId) press = undefined;
    if (e.type === "pointercancel") feed({ type: "cancel" });
    else feed({ type: "up", pointerId: e.pointerId });
  };

  const onContextMenu = (e: MouseEvent): void => {
    if (foreign(e) || !deps.listening()) return;
    // The browser's menu is suppressed whenever a listener exists.
    e.preventDefault();
    const pointerId = (e as PointerEvent).pointerId;
    const handled = feed({
      type: "native-contextmenu",
      ...(pointerId !== undefined ? { pointerId } : {}),
    });
    if (handled || swallowNative) return;
    const type = pointerTypeOf(e as PointerEvent) ?? "mouse";
    // A touch menu comes only from the long-press machine (which may be turned off).
    if (type === "touch") return;
    // A drag past its threshold is never disturbed.
    if (deps.activePointer() !== undefined && press?.dragging) return;
    raiseAt(viewportOf(e), type, modifiersOf(e, deps.platform));
  };

  const onKeyDown = (e: KeyboardEvent): void => {
    if (!MENU_KEY(e) || !shouldHandleKey(e)) return;
    if (isOverlayContent(e.target, deps.overlay) || !deps.listening()) return;
    if (deps.activePointer() !== undefined) return;
    e.preventDefault();
    swallowNative = true;
    const ctx = deps.context();
    const { width, height } = deps.size();
    const a = viewportToWorld(ctx.viewport, { x: 0, y: 0 });
    const b = viewportToWorld(ctx.viewport, { x: width, y: height });
    const visible = rect<"world">(a.x, a.y, b.x - a.x, b.y - a.y);
    const { target, world } = keyboardTarget(ctx.selection, ctx.scene, visible);
    raise(target, [], "keyboard", modifiersOf(e, deps.platform), world);
  };

  const onKeyUp = (e: KeyboardEvent): void => {
    if (!swallowNative || !(e.key === "ContextMenu" || e.key === "F10")) return;
    // The native event follows the key-up on Windows; give it one task.
    win?.setTimeout(() => {
      swallowNative = false;
    }, 0);
  };

  const onBlur = (): void => void feed({ type: "cancel" });
  const onVisibility = (): void => {
    if (doc.visibilityState === "hidden") feed({ type: "cancel" });
  };

  const listeners: Array<[EventTarget, string, EventListener]> = [
    [root, "pointerdown", onPointerDown as EventListener],
    [root, "pointermove", onPointerMove as EventListener],
    [root, "pointerup", onPointerEnd as EventListener],
    [root, "pointercancel", onPointerEnd as EventListener],
    [root, "contextmenu", onContextMenu as EventListener],
    [root, "keydown", onKeyDown as EventListener],
    [root, "keyup", onKeyUp as EventListener],
    [doc, "visibilitychange", onVisibility],
  ];
  if (win) listeners.push([win, "blur", onBlur]);
  for (const [target, type, fn] of listeners) target.addEventListener(type, fn);

  let disposed = false;
  return {
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const [target, type, fn] of listeners) {
        target.removeEventListener(type, fn);
      }
      clearTimer();
      longPress = LONG_PRESS_IDLE;
      press = undefined;
    },
  };
}
