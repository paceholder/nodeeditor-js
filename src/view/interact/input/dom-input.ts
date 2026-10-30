/**
 * DOM input adapter (D3, D10): turns pointer, wheel and key events
 * on the view root into `ToolInput`, executes the resulting effects through the effect
 * runner, and maps every cancellation source (pointercancel, lost capture, window blur,
 * hidden document, dispose) to a tool `cancel`. Attached during mount, removed on dispose.
 * Tools themselves never see a DOM type.
 */
import type { HitCandidate, Point } from "../../../core/index.js";
import type { ToolRouter } from "../tools/tool-router.js";
import type {
  CancelReason,
  CursorKind,
  Modifiers,
  PointerType,
  ToolContext,
  ToolInput,
} from "../tools/tool-types.js";
import { createEffectRunner, type EffectHost } from "./effect-runner.js";
import {
  isOverlayContent,
  isTextTarget,
  shouldHandleKey,
} from "./input-scope.js";

export interface DomInputDeps {
  readonly router: ToolRouter;
  readonly context: () => ToolContext;
  /** The non-DOM parts of the effect host; capture, release and cursor are added here. */
  readonly host: Omit<EffectHost, "capture" | "release" | "cursor">;
  /** Client position to viewport and world points; undefined while not measurable. */
  readonly coords: (
    clientX: number,
    clientY: number,
  ) => { viewport: Point<"viewport">; world: Point<"world"> } | undefined;
  readonly overlay: HTMLElement;
  readonly platform: "mac" | "other";
  /** Run the command bound to a key event; true when the key was bound. */
  readonly onKey: (event: KeyboardEvent) => boolean;
  /** The topmost hit under an idle pointer, undefined when none. */
  readonly onHover: (hit: HitCandidate | undefined) => void;
}

export interface DomInput {
  /** Tell the active tool that entities left the model (it cancels if it uses them). */
  entitiesRemoved(ids: readonly string[]): void;
  dispose(): void;
}

const BUTTONS = new Set([0, 1, 2]);

function pointerTypeOf(e: PointerEvent): PointerType | undefined {
  return e.pointerType === "mouse" ||
    e.pointerType === "touch" ||
    e.pointerType === "pen"
    ? e.pointerType
    : undefined;
}

export function attachDomInput(
  root: HTMLElement,
  deps: DomInputDeps,
): DomInput {
  const { router } = deps;
  const doc = root.ownerDocument;
  const win = doc.defaultView;
  // Pointers we released ourselves: their `lostpointercapture` is not a cancellation.
  const released = new Set<number>();
  let lastCursor: CursorKind = "default";

  const setCursor = (cursor: CursorKind): void => {
    if (cursor === lastCursor) return;
    lastCursor = cursor;
    root.style.cursor = cursor === "default" ? "" : cursor;
  };
  const run = createEffectRunner({
    ...deps.host,
    capture(pointerId) {
      try {
        root.setPointerCapture(pointerId);
        released.delete(pointerId);
      } catch {
        // A pointer that is no longer active cannot be captured; the gesture still runs.
      }
    },
    release(pointerId) {
      try {
        if (root.hasPointerCapture(pointerId)) {
          released.add(pointerId);
          root.releasePointerCapture(pointerId);
        }
      } catch {
        // Already gone.
      }
    },
    cursor: setCursor,
  });

  const modifiers = (e: {
    shiftKey: boolean;
    altKey: boolean;
    ctrlKey: boolean;
    metaKey: boolean;
  }): Modifiers => ({
    shift: e.shiftKey,
    alt: e.altKey,
    mod: deps.platform === "mac" ? e.metaKey : e.ctrlKey,
  });

  const send = (input: ToolInput) => {
    const result = router.handle(input, deps.context());
    run(result.effects);
    return result;
  };

  const cancel = (reason: CancelReason): void => {
    if (router.activePointer !== undefined) send({ type: "cancel", reason });
  };

  function pointer(
    type: "pointer-down" | "pointer-move" | "pointer-up",
    e: PointerEvent,
  ) {
    const at = deps.coords(e.clientX, e.clientY);
    if (!at) return undefined;
    const pointerType = pointerTypeOf(e);
    const base = {
      pointerId: e.pointerId,
      button: BUTTONS.has(e.button) ? (e.button as 0 | 1 | 2) : 0,
      viewport: at.viewport,
      world: at.world,
      modifiers: modifiers(e),
      time: e.timeStamp,
      ...(pointerType ? { pointerType } : {}),
    } as const;
    return send(
      type === "pointer-down"
        ? { type, ...base }
        : type === "pointer-move"
          ? { type, ...base }
          : { type, ...base },
    );
  }

  const onPointerDown = (e: PointerEvent): void => {
    if (!BUTTONS.has(e.button) || isOverlayContent(e.target, deps.overlay)) {
      return;
    }
    // Focus first so keyboard shortcuts follow the pointer; never steal from text fields.
    if (!isTextTarget(doc.activeElement) || doc.activeElement === root) {
      root.focus({ preventScroll: true });
    }
    const result = pointer("pointer-down", e);
    // Unclaimed presses (right button) keep the browser's default, e.g. the context menu.
    if (result?.handled && e.button !== 2) e.preventDefault();
  };

  const onPointerMove = (e: PointerEvent): void => {
    if (router.activePointer !== undefined) {
      pointer("pointer-move", e);
      return;
    }
    if (e.pointerType !== "mouse") return;
    const at = deps.coords(e.clientX, e.clientY);
    if (!at) return;
    const top = deps.context().pick(at.world)[0];
    deps.onHover(top);
    setCursor(top?.kind === "port" ? "crosshair" : "default");
  };

  const onPointerUp = (e: PointerEvent): void => {
    pointer("pointer-up", e);
  };

  const onPointerCancel = (e: PointerEvent): void => {
    if (e.pointerId === router.activePointer) cancel("pointercancel");
  };

  const onLostCapture = (e: PointerEvent): void => {
    if (released.delete(e.pointerId)) return;
    if (e.pointerId === router.activePointer) cancel("lost-capture");
  };

  const onPointerLeave = (e: PointerEvent): void => {
    if (router.activePointer === undefined && e.pointerType === "mouse") {
      deps.onHover(undefined);
    }
  };

  const onWheel = (e: WheelEvent): void => {
    const at = deps.coords(e.clientX, e.clientY);
    if (!at || isOverlayContent(e.target, deps.overlay)) return;
    // Normalize line and page deltas to CSS pixels.
    const scale =
      e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? root.clientHeight : 1;
    const result = send({
      type: "wheel",
      viewport: at.viewport,
      deltaY: e.deltaY * scale,
      modifiers: modifiers(e),
    });
    // Only a wheel that changed the viewport is consumed; otherwise the page scrolls.
    if (result.handled) e.preventDefault();
  };

  const onKeyDown = (e: KeyboardEvent): void => {
    if (!shouldHandleKey(e)) return;
    const result = send({
      type: "key-down",
      key: e.key,
      modifiers: modifiers(e),
    });
    if (result.handled) {
      e.preventDefault();
      return;
    }
    if (e.key === " ") {
      e.preventDefault();
      if (router.activePointer === undefined) setCursor("grab");
      return;
    }
    // No shortcuts in the middle of a gesture: one gesture is one history entry.
    if (router.activePointer !== undefined) return;
    if (deps.onKey(e)) e.preventDefault();
  };

  const onKeyUp = (e: KeyboardEvent): void => {
    send({ type: "key-up", key: e.key, modifiers: modifiers(e) });
    if (e.key === " " && router.activePointer === undefined)
      setCursor("default");
  };

  const onBlur = (): void => {
    cancel("blur");
    // A key released while another window had focus never reaches us.
    send({
      type: "key-up",
      key: " ",
      modifiers: { shift: false, alt: false, mod: false },
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
    [root, "lostpointercapture", onLostCapture as EventListener],
    [root, "pointerleave", onPointerLeave as EventListener],
    [root, "wheel", onWheel as EventListener, { passive: false }],
    [root, "keydown", onKeyDown as EventListener],
    [root, "keyup", onKeyUp as EventListener],
    [root, "blur", onBlur],
    [doc, "visibilitychange", onVisibility],
  ];
  if (win) listeners.push([win, "blur", onBlur]);
  for (const [target, type, fn, opts] of listeners) {
    target.addEventListener(type, fn, opts);
  }

  let disposed = false;
  return {
    entitiesRemoved(ids) {
      if (router.activePointer !== undefined && ids.length > 0) {
        send({ type: "entities-removed", ids });
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      // A gesture in flight ends as a cancel: nothing is committed, previews clear.
      cancel("dispose");
      for (const [target, type, fn, opts] of listeners) {
        target.removeEventListener(type, fn, opts);
      }
      if (!hadTabIndex) root.removeAttribute("tabindex");
      root.style.cursor = "";
      deps.onHover(undefined);
      released.clear();
    },
  };
}
