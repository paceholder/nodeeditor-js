/**
 * Auto-pan driver (INT-09, INT-08, PERF-02d, D10). DOM-free: an injected frame clock,
 * the router's `autoPanning()`, the view size and two callbacks.
 *
 * After every routed input the host calls `update(lastMove)`. While the active gesture
 * auto-pans and the armed velocity is non-zero, one animation frame is requested (never
 * two). Each frame pans the viewport by `-v · dt` (`dt` capped at 50 ms, so a throttled
 * tab does not jump) and replays the last pointer-move with the same viewport point and
 * the world point recomputed, so the tool's preview follows; then it requests the next
 * frame only if still needed. A release, cancel or dispose reaches the router
 * synchronously and the following `update` cancels the pending request, so panning
 * stops in the same frame and no frame is requested afterwards. The driver never
 * commits: the gesture's own release does, once.
 */
import type { Point } from "../../../core/index.js";
import type { FrameClock } from "../../platform/frame-scheduler.js";
import {
  type AutoPanArm,
  type AutoPanOptions,
  armedVelocity,
  startArm,
  updateArm,
  type ViewSize,
} from "../tools/auto-pan.js";
import type { PointerMoveInput, ToolInput } from "../tools/tool-types.js";

/** Longest step one frame may integrate, milliseconds. */
const MAX_STEP_MS = 50;
/** Step assumed for the first frame after a start, milliseconds. */
const FIRST_STEP_MS = 1000 / 60;

export interface AutoPanDriverDeps {
  readonly clock: FrameClock;
  readonly router: {
    autoPanning(): boolean;
    readonly activePointer: number | undefined;
  };
  readonly size: () => ViewSize;
  readonly options: () => AutoPanOptions | false;
  /** Apply a viewport pan in CSS pixels through the normal viewport effect. */
  readonly panBy: (dx: number, dy: number) => void;
  /** World point under a viewport point for the current viewport. */
  readonly toWorld: (point: Point<"viewport">) => Point<"world"> | undefined;
  /** Route a replayed pointer-move and run its effects (without calling `update`). */
  readonly send: (input: ToolInput) => void;
}

export interface AutoPanDriver {
  /**
   * Re-evaluate after an input was routed. A pointer-down starts arming at the press
   * point; pointer-moves are remembered for replay; any input that leaves the router
   * without a gesture, or with one that does not auto-pan, cancels the pending frame.
   */
  update(input: ToolInput): void;
  /** True while a frame request is outstanding. */
  isPending(): boolean;
  /** Cancel any pending frame; later updates are ignored. */
  dispose(): void;
}

export function createAutoPanDriver(deps: AutoPanDriverDeps): AutoPanDriver {
  let handle: number | undefined;
  let last: PointerMoveInput | undefined;
  let arm: AutoPanArm | undefined;
  let lastTick: number | undefined;
  let disposed = false;

  const cancel = (): void => {
    if (handle !== undefined) deps.clock.cancel(handle);
    handle = undefined;
    lastTick = undefined;
  };

  const track = (input: ToolInput): void => {
    const size = deps.size();
    const options = deps.options();
    if (input.type === "pointer-down") {
      arm = startArm(input.viewport, size, options);
      last = undefined;
    } else if (input.type === "pointer-move") {
      arm = arm
        ? updateArm(arm, input.viewport, size, options)
        : startArm(input.viewport, size, options);
      last = input;
    }
  };

  /** Request or cancel the next frame for the current state; true while panning. */
  function evaluate(): boolean {
    if (deps.router.activePointer === undefined) {
      last = undefined;
      arm = undefined;
    }
    const v =
      last && arm && deps.router.autoPanning()
        ? armedVelocity(arm, last.viewport, deps.size(), deps.options())
        : undefined;
    if (!v || (v.x === 0 && v.y === 0)) {
      cancel();
      return false;
    }
    if (handle === undefined) handle = deps.clock.request(tick);
    return true;
  }

  function tick(now: number): void {
    handle = undefined;
    const move = last;
    if (disposed || !move || !arm || !deps.router.autoPanning()) return;
    const v = armedVelocity(arm, move.viewport, deps.size(), deps.options());
    if (v.x === 0 && v.y === 0) return;
    const dt = Math.min(
      lastTick === undefined ? FIRST_STEP_MS : now - lastTick,
      MAX_STEP_MS,
    );
    lastTick = now;
    deps.panBy((-v.x * dt) / 1000, (-v.y * dt) / 1000);
    const world = deps.toWorld(move.viewport);
    const replay: PointerMoveInput = world
      ? { ...move, world, time: now }
      : move;
    deps.send(replay);
    last = replay;
    evaluate();
  }

  return {
    update(input) {
      if (disposed) return;
      track(input);
      evaluate();
    },
    isPending: () => handle !== undefined,
    dispose() {
      disposed = true;
      cancel();
      last = undefined;
      arm = undefined;
    },
  };
}
