/**
 * DOM input adapter (D3, D10): turns pointer, wheel and key events
 * on the view root into `ToolInput`, executes the resulting effects through the effect
 * runner, and maps every cancellation source (pointercancel, lost capture, window blur,
 * hidden document, dispose) to a tool `cancel`. Attached during mount, removed on
 * dispose. Tools never see a DOM type.
 */
import { viewportToWorld } from "../../../core/index.js";
import { distancePx, dragThreshold } from "../tools/thresholds.js";
import {
  type CancelReason,
  type CursorKind,
  NO_MODIFIERS,
  type PointerInput,
  type ToolInput,
} from "../tools/tool-types.js";
import { createAutoPanDriver } from "./auto-pan-driver.js";
import type { DomInput, DomInputDeps } from "./dom-input-types.js";
import { createEffectRunner } from "./effect-runner.js";
import { createIdleCursor } from "./idle-cursor.js";
import { isOverlayContent, isTextTarget } from "./input-scope.js";
import { createKeyInput } from "./key-input.js";
import {
  BUTTONS,
  createPointerCapture,
  type ModifierKeys,
  modifiersOf,
  pointerInputOf,
  pointerTypeOf,
  wheelInputOf,
} from "./pointer-input.js";
import { createTouchPinch, type PinchInput } from "./touch-pinch.js";

export type { DomInput, DomInputDeps } from "./dom-input-types.js";

export function attachDomInput(
  root: HTMLElement,
  deps: DomInputDeps,
): DomInput {
  const { router } = deps;
  const doc = root.ownerDocument;
  const win = doc.defaultView;
  const captures = createPointerCapture(root);
  let lastCursor: CursorKind = "default";
  // Last client position inside the root; converted on demand so pans and zooms count.
  let lastClient: { x: number; y: number } | undefined;
  const track = (e: PointerEvent): void => {
    if (e.pointerType === "mouse" || e.pointerType === "pen") {
      lastClient = { x: e.clientX, y: e.clientY };
    }
  };

  const setCursor = (cursor: CursorKind): void => {
    if (cursor === lastCursor) return;
    lastCursor = cursor;
    root.style.cursor = cursor === "default" ? "" : cursor;
  };
  const run = createEffectRunner({
    ...deps.host,
    capture: captures.capture,
    release: captures.release,
    cursor: setCursor,
  });

  const modifiers = (e: ModifierKeys) => modifiersOf(e, deps.platform);

  /** Run `step`; tell the host when it ended the gesture that was running (or replaced it). */
  const watchEnd = <T>(step: () => T): T => {
    const tool = router.activeTool;
    const generation = router.generation;
    const result = step();
    if (
      tool !== undefined &&
      (router.activeTool === undefined || router.generation !== generation)
    ) {
      deps.onGestureEnd?.();
    }
    return result;
  };
  const send = (input: ToolInput) =>
    watchEnd(() => {
      const wasActive = router.activePointer !== undefined;
      const result = router.handle(input, deps.context());
      run(result.effects);
      if (wasActive && router.activePointer === undefined) {
        deps.hover.gestureEnded();
      }
      return result;
    });
  const driver = deps.autoPan
    ? createAutoPanDriver({
        clock: deps.autoPan.clock,
        router,
        size: deps.autoPan.size,
        options: () => deps.context().options.autoPan,
        panBy: (dx, dy) => deps.host.viewport({ kind: "panBy", dx, dy }),
        toWorld: (p) => viewportToWorld(deps.context().viewport, p),
        send,
      })
    : undefined;
  // Every routed input re-evaluates auto-pan; its replays use `send` only (D10).
  const route = (input: ToolInput) => {
    const result = send(input);
    driver?.update(input);
    return result;
  };

  const cancel = (reason: CancelReason): boolean => {
    if (router.activeTool === undefined) return false;
    route({ type: "cancel", reason });
    return true;
  };

  function pointer(type: PointerInput["type"], e: PointerEvent) {
    const at = deps.coords(e.clientX, e.clientY);
    if (!at) return undefined;
    return route(pointerInputOf(type, e, at, deps.platform));
  }

  // The resting mouse's cursor: one scene pick per frame, not per move.
  const idle = createIdleCursor({
    clock: deps.clock,
    cursorAt(clientX, clientY) {
      const at = deps.coords(clientX, clientY);
      if (!at || router.activePointer !== undefined) return undefined;
      const top = deps.context().pick(at.world)[0];
      return (
        deps.hoverCursor?.(at.world) ??
        (top?.kind === "port" ? "crosshair" : "default")
      );
    },
    setCursor,
  });

  // Two-finger pinch zoom: touches go to the pinch first; true when it owns the event.
  const pinch = createTouchPinch({
    cancel: () => void cancel("pinch"),
    viewport: deps.host.viewport,
  });
  const pinchTouch = (e: PointerEvent, input: PinchInput): boolean =>
    e.pointerType === "touch" && pinch.feed(input);
  const viewportAt = (e: PointerEvent) =>
    deps.coords(e.clientX, e.clientY)?.viewport;

  // The press of the running gesture, until it moves past the drag threshold.
  let press:
    | { pointerId: number; x: number; y: number; dragged: boolean }
    | undefined;

  const onPointerDown = (e: PointerEvent): void => {
    track(e);
    if (!BUTTONS.has(e.button) || isOverlayContent(e.target, deps.overlay)) {
      return;
    }
    // Focus first so keyboard shortcuts follow the pointer; never steal from text fields.
    if (!isTextTarget(doc.activeElement) || doc.activeElement === root) {
      root.focus({ preventScroll: true });
    }
    const touchAt = viewportAt(e);
    if (
      touchAt &&
      pinchTouch(e, { type: "down", pointerId: e.pointerId, at: touchAt })
    ) {
      e.preventDefault();
      return;
    }
    const result = pointer("pointer-down", e);
    if (router.activePointer === e.pointerId) {
      press = {
        pointerId: e.pointerId,
        x: e.clientX,
        y: e.clientY,
        dragged: false,
      };
    }
    // Unclaimed presses (right button) keep the browser's default, e.g. the context menu.
    if (result?.handled && e.button !== 2) e.preventDefault();
  };

  const onPointerMove = (e: PointerEvent): void => {
    track(e);
    const touchAt = viewportAt(e);
    if (
      touchAt &&
      pinchTouch(e, { type: "move", pointerId: e.pointerId, at: touchAt })
    ) {
      return;
    }
    if (press?.pointerId === e.pointerId && !press.dragged) {
      const limit = dragThreshold(deps.context().options, pointerTypeOf(e));
      press.dragged = distancePx({ x: e.clientX, y: e.clientY }, press) > limit;
    }
    // Host content in the overlay (a popover, the controls) is not the canvas: the pointer
    // moving over it neither picks the node underneath nor ends the current hover, so a
    // popover anchored to a node can be entered.
    if (
      e.pointerType === "mouse" &&
      !isOverlayContent(e.target, deps.overlay)
    ) {
      deps.hover.move(e.clientX, e.clientY);
    }
    if (router.activePointer !== undefined) {
      idle.cancel();
      pointer("pointer-move", e);
      return;
    }
    if (e.pointerType === "mouse") idle.move(e.clientX, e.clientY);
  };

  const onPointerUp = (e: PointerEvent): void => {
    if (pinchTouch(e, { type: "up", pointerId: e.pointerId })) return;
    pointer("pointer-up", e);
  };

  // A native menu opened over a press that has not started dragging (macOS Control-click,
  // a right-click): the browser may never deliver the release, so the press ends now,
  // whether or not a context-menu listener is registered. A drag is never disturbed.
  const onContextMenu = (e: MouseEvent): void => {
    if (isOverlayContent(e.target, deps.overlay)) return;
    if (router.activePointer === undefined || press?.dragged === true) return;
    cancel("context-menu");
  };

  const onPointerCancel = (e: PointerEvent): void => {
    pinchTouch(e, { type: "up", pointerId: e.pointerId });
    if (e.pointerId === router.activePointer) cancel("pointercancel");
  };

  const onLostCapture = (e: PointerEvent): void => {
    if (captures.releasedByUs(e.pointerId)) return;
    if (e.pointerId === router.activePointer) cancel("lost-capture");
  };

  const onPointerLeave = (e: PointerEvent): void => {
    if (e.pointerType === "mouse" || e.pointerType === "pen") {
      lastClient = undefined;
    }
    if (e.pointerType === "mouse") idle.cancel();
    if (e.pointerType === "mouse") deps.hover.leave();
  };

  const onWheel = (e: WheelEvent): void => {
    const at = deps.coords(e.clientX, e.clientY);
    if (!at || isOverlayContent(e.target, deps.overlay)) return;
    const result = route(
      wheelInputOf(e, at.viewport, root.clientHeight, deps.platform),
    );
    // A wheel that changed the viewport is consumed, and a pinch always is (the browser
    // would zoom the page); otherwise the page scrolls.
    if (result.handled) e.preventDefault();
  };

  const keys = createKeyInput({
    router,
    overlay: deps.overlay,
    route,
    modifiers,
    setCursor,
    onKey: deps.onKey,
  });

  const onBlur = (): void => {
    cancel("blur");
    // A key released while another window had focus never reaches us.
    route({
      type: "key-up",
      key: " ",
      modifiers: NO_MODIFIERS,
    });
    if (router.activePointer === undefined) setCursor("default");
  };
  const onVisibility = (): void => {
    if (doc.visibilityState === "hidden") cancel("hidden");
  };

  const hadTabIndex = root.hasAttribute("tabindex");
  if (!hadTabIndex) root.tabIndex = 0;
  const listeners: Array<
    [EventTarget, string, EventListener, AddEventListenerOptions?]
  > = [
    [root, "pointerdown", onPointerDown as EventListener],
    [root, "pointermove", onPointerMove as EventListener],
    [root, "pointerup", onPointerUp as EventListener],
    [root, "pointercancel", onPointerCancel as EventListener],
    [root, "contextmenu", onContextMenu as EventListener],
    [root, "lostpointercapture", onLostCapture as EventListener],
    [root, "pointerleave", onPointerLeave as EventListener],
    [root, "wheel", onWheel as EventListener, { passive: false }],
    [root, "keydown", keys.onKeyDown as EventListener],
    [root, "keyup", keys.onKeyUp as EventListener],
    [root, "blur", onBlur],
    [doc, "visibilitychange", onVisibility],
  ];
  if (win) listeners.push([win, "blur", onBlur]);
  for (const [target, type, fn, opts] of listeners) {
    target.addEventListener(type, fn, opts);
  }

  let disposed = false;
  return {
    modelChanged(change) {
      watchEnd(() => {
        const wasActive = router.activePointer !== undefined;
        const result = router.changed(change, deps.context());
        if (!result.cancelled) return;
        run(result.effects);
        driver?.update({ type: "cancel", reason: result.cancelled.reason });
        if (wasActive && router.activePointer === undefined) {
          deps.hover.gestureEnded();
        }
        deps.onGestureCancelled?.(result.cancelled);
      });
    },
    verdictSettled() {
      if (router.activeTool !== undefined) route({ type: "verdict" });
    },
    modelReset() {
      if (router.activeTool === undefined) return;
      cancel("reset");
      deps.onGestureCancelled?.({ reason: "reset", ids: [] });
    },
    cancelGesture: cancel,
    pointerWorld() {
      return lastClient && deps.coords(lastClient.x, lastClient.y)?.world;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      // A gesture in flight ends as a cancel: nothing is committed, previews clear.
      cancel("dispose");
      idle.dispose();
      driver?.dispose();
      for (const [target, type, fn, opts] of listeners) {
        target.removeEventListener(type, fn, opts);
      }
      if (!hadTabIndex) root.removeAttribute("tabindex");
      root.style.cursor = "";
      captures.clear();
      lastClient = undefined;
    },
  };
}
