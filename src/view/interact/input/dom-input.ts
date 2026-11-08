/**
 * DOM input adapter (D3, D10): turns pointer, wheel and key events
 * on the view root into `ToolInput`, executes the resulting effects through the effect
 * runner, and maps every cancellation source (pointercancel, lost capture, window blur,
 * hidden document, dispose) to a tool `cancel`. Attached during mount, removed on
 * dispose. Tools never see a DOM type.
 */
import { type Point, viewportToWorld } from "../../../core/index.js";
import type { ToolRouter } from "../tools/tool-router.js";
import {
  type CancelReason,
  type CursorKind,
  NO_MODIFIERS,
  type PointerInput,
  type ToolContext,
  type ToolInput,
} from "../tools/tool-types.js";
import { type AutoPanHost, createAutoPanDriver } from "./auto-pan-driver.js";
import { createEffectRunner, type EffectHost } from "./effect-runner.js";
import { isOverlayContent, isTextTarget } from "./input-scope.js";
import { createKeyInput } from "./key-input.js";
import {
  BUTTONS,
  createPointerCapture,
  type ModifierKeys,
  modifiersOf,
  pointerInputOf,
} from "./pointer-input.js";

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
  /**
   * Run the command bound to a key event; true when the key was bound (the key-down is
   * then default-prevented). `"native"` means the browser's own action carries the
   * command (clipboard chords), so the key-down keeps its default (D8).
   */
  readonly onKey: (event: KeyboardEvent) => boolean | "native";
  /**
   * Pointer position reports for hover tracking: every mouse move over the root
   * (also during a gesture), the pointer leaving, and a gesture ending.
   */
  readonly hover: {
    move(clientX: number, clientY: number): void;
    leave(): void;
    gestureEnded(): void;
  };
  /** A cursor that wins over the hit-based one for an idle pointer (resize handle). */
  readonly hoverCursor?: (world: Point<"world">) => CursorKind | undefined;
  /** Auto-pan during drags: the view's frame clock and CSS size. */
  readonly autoPan?: AutoPanHost;
}

export interface DomInput {
  /** Tell the active tool that entities left the model (it cancels if it uses them). */
  entitiesRemoved(ids: readonly string[]): void;
  /** Tell the active tool the document was replaced: any gesture in flight cancels. */
  modelReset(): void;
  /** Cancel the gesture in flight, if any: nothing is committed. */
  cancelGesture(reason: CancelReason): void;
  /** World position of the pointer while it is over the root, else undefined. */
  pointerWorld(): Point<"world"> | undefined;
  dispose(): void;
}

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

  const send = (input: ToolInput) => {
    const wasActive = router.activePointer !== undefined;
    const result = router.handle(input, deps.context());
    run(result.effects);
    if (wasActive && router.activePointer === undefined) {
      deps.hover.gestureEnded();
    }
    return result;
  };
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

  const cancel = (reason: CancelReason): void => {
    if (router.activePointer !== undefined) route({ type: "cancel", reason });
  };

  function pointer(type: PointerInput["type"], e: PointerEvent) {
    const at = deps.coords(e.clientX, e.clientY);
    if (!at) return undefined;
    return route(pointerInputOf(type, e, at, deps.platform));
  }

  const onPointerDown = (e: PointerEvent): void => {
    track(e);
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
    track(e);
    if (e.pointerType === "mouse") deps.hover.move(e.clientX, e.clientY);
    if (router.activePointer !== undefined) {
      pointer("pointer-move", e);
      return;
    }
    if (e.pointerType !== "mouse") return;
    const at = deps.coords(e.clientX, e.clientY);
    if (!at) return;
    const top = deps.context().pick(at.world)[0];
    setCursor(
      deps.hoverCursor?.(at.world) ??
        (top?.kind === "port" ? "crosshair" : "default"),
    );
  };

  const onPointerUp = (e: PointerEvent): void => {
    pointer("pointer-up", e);
  };

  const onPointerCancel = (e: PointerEvent): void => {
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
    if (e.pointerType === "mouse") deps.hover.leave();
  };

  const onWheel = (e: WheelEvent): void => {
    const at = deps.coords(e.clientX, e.clientY);
    if (!at || isOverlayContent(e.target, deps.overlay)) return;
    // Normalize line and page deltas to CSS pixels.
    const scale =
      e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? root.clientHeight : 1;
    const result = route({
      type: "wheel",
      viewport: at.viewport,
      deltaY: e.deltaY * scale,
      modifiers: modifiers(e),
    });
    // Only a wheel that changed the viewport is consumed; otherwise the page scrolls.
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
    entitiesRemoved(ids) {
      if (router.activePointer !== undefined && ids.length > 0) {
        route({ type: "entities-removed", ids });
      }
    },
    modelReset() {
      cancel("reset");
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
