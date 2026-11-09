/** Contracts of the DOM input adapter (`dom-input.ts`). */
import type { Point } from "../../../core/index.js";
import type { FrameClock } from "../../platform/frame-scheduler.js";
import type { GestureChange, ToolRouter } from "../tools/tool-router.js";
import type {
  CancelReason,
  CursorKind,
  GestureCancellation,
  ToolContext,
} from "../tools/tool-types.js";
import type { AutoPanHost } from "./auto-pan-driver.js";
import type { EffectHost } from "./effect-runner.js";

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
  /** The view's frame clock: the idle cursor is chosen at most once per frame. */
  readonly clock: FrameClock;
  /** Auto-pan during drags: the view's frame clock and CSS size. */
  readonly autoPan?: AutoPanHost;
  /** The router went from a running gesture to none, however it ended. */
  readonly onGestureEnd?: () => void;
  /** A gesture ended because of a model change or a lock, not the user. */
  readonly onGestureCancelled?: (cancellation: GestureCancellation) => void;
}

export interface DomInput {
  /**
   * A model change was committed: the gesture in flight is cancelled when an entity it
   * involves was removed or changed, whatever the change's origin.
   */
  modelChanged(change: GestureChange): void;
  /** A host verdict settled: a gesture showing or waiting on a pending target re-reads it. */
  verdictSettled(): void;
  /** Tell the active tool the document was replaced: any gesture in flight cancels. */
  modelReset(): void;
  /** Cancel the gesture in flight, if any: nothing is committed. True if one ran. */
  cancelGesture(reason: CancelReason): boolean;
  /** World position of the pointer while it is over the root, else undefined. */
  pointerWorld(): Point<"world"> | undefined;
  dispose(): void;
}
