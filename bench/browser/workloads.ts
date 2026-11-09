/**
 * Scripted workloads (design D4). Each script turns elapsed time into real DOM pointer or
 * wheel events dispatched on the view root, so the input adapter, router and tools are all
 * exercised. Speeds are defined per second of wall time, so a dropped frame shows up as a
 * longer interval, not as less motion.
 */
import type { ViewHandle } from "@paceholder/nodeeditor-js/view";

export const WORKLOADS = ["pan", "zoom", "drag"] as const;
/** The overview navigation target rule: the same pan and zoom scripts with the whole fixture on screen. */
export const OVERVIEW_WORKLOADS = ["overview-pan", "overview-zoom"] as const;
export type WorkloadName =
  | (typeof WORKLOADS)[number]
  | (typeof OVERVIEW_WORKLOADS)[number];

export interface Pointer {
  readonly x: number;
  readonly y: number;
}

export interface Script {
  /** Dispatch the events due at `elapsedMs`; returns the pointer position, if any. */
  step(elapsedMs: number): Pointer | undefined;
  /** Release anything held down. */
  finish(): void;
}

export interface WorkloadConfig {
  /** Zoom range of the zoom sweep. */
  readonly zoomRange: readonly [number, number];
}

const WHEEL_SENSITIVITY = 0.0015; // the default tool option
const PAN_SPEED_PX_S = 700;
const PAN_STROKE_PX = 800;
const ZOOM_PERIOD_MS = 6000;
const DRAG_PERIOD_MS = 4000;

function pointerEvent(
  root: HTMLElement,
  type: "pointerdown" | "pointermove" | "pointerup",
  at: Pointer,
  button: number,
): void {
  root.dispatchEvent(
    new PointerEvent(type, {
      pointerId: 1,
      pointerType: "mouse",
      isPrimary: true,
      clientX: at.x,
      clientY: at.y,
      button,
      buttons: type === "pointerup" ? 0 : 1 << button,
      bubbles: true,
      cancelable: true,
      composed: true,
    }),
  );
}

/** Constant-velocity middle-button strokes, alternating direction. */
function panScript(view: ViewHandle): Script {
  const rect = view.element.getBoundingClientRect();
  const y = rect.top + rect.height / 2;
  const left = rect.left + 300;
  let dir = 1;
  let startedAt: number | undefined;
  let at: Pointer = { x: left, y };
  return {
    step(t) {
      if (startedAt === undefined) {
        startedAt = t;
        at = { x: dir > 0 ? left : left + PAN_STROKE_PX, y };
        pointerEvent(view.element, "pointerdown", at, 1);
        return at;
      }
      const travelled = ((t - startedAt) * PAN_SPEED_PX_S) / 1000;
      if (travelled >= PAN_STROKE_PX) {
        pointerEvent(view.element, "pointerup", at, 1);
        startedAt = undefined;
        dir = -dir;
        return at;
      }
      const from = dir > 0 ? left : left + PAN_STROKE_PX;
      at = { x: from + dir * travelled, y };
      pointerEvent(view.element, "pointermove", at, 1);
      return at;
    },
    finish() {
      if (startedAt !== undefined)
        pointerEvent(view.element, "pointerup", at, 1);
    },
  };
}

/** Wheel zoom about a fixed cursor, following a sine in log-zoom between the bounds. */
function zoomScript(view: ViewHandle, cfg: WorkloadConfig): Script {
  const rect = view.element.getBoundingClientRect();
  const at = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  const [lo, hi] = cfg.zoomRange;
  const mid = (Math.log(lo) + Math.log(hi)) / 2;
  const amp = (Math.log(hi) - Math.log(lo)) / 2;
  return {
    step(t) {
      const target = Math.exp(
        mid + amp * Math.sin((2 * Math.PI * t) / ZOOM_PERIOD_MS),
      );
      const deltaY =
        -Math.log(target / view.viewport.get().zoom) / WHEEL_SENSITIVITY;
      view.element.dispatchEvent(
        new WheelEvent("wheel", {
          clientX: at.x,
          clientY: at.y,
          deltaY,
          bubbles: true,
          cancelable: true,
          composed: true,
        }),
      );
      return at;
    },
    finish() {},
  };
}

/** A client position near the view centre where the topmost hit is a node body. */
export function findNodePoint(view: ViewHandle): Pointer {
  const rect = view.element.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  let best: { p: Pointer; d: number } | undefined;
  for (let dy = -240; dy <= 240; dy += 6) {
    for (let dx = -240; dx <= 240; dx += 6) {
      const hit = view.pick(cx + dx, cy + dy)[0];
      const d = dx * dx + dy * dy;
      if (hit?.kind === "node" && (!best || d < best.d))
        best = { p: { x: cx + dx, y: cy + dy }, d };
    }
  }
  if (!best) throw new Error("no node found near the view centre");
  return best.p;
}

/** One node dragged along a figure-eight, one gesture for the whole run. */
function dragScript(view: ViewHandle): Script {
  const origin = findNodePoint(view);
  let at = origin;
  let down = false;
  return {
    step(t) {
      if (!down) {
        down = true;
        pointerEvent(view.element, "pointerdown", origin, 0);
        return origin;
      }
      const w = (2 * Math.PI * t) / DRAG_PERIOD_MS;
      at = {
        x: origin.x + 150 * Math.sin(w),
        y: origin.y + 90 * Math.sin(2 * w),
      };
      pointerEvent(view.element, "pointermove", at, 0);
      return at;
    },
    finish() {
      if (down) pointerEvent(view.element, "pointerup", at, 0);
    },
  };
}

export function createScript(
  name: WorkloadName,
  view: ViewHandle,
  cfg: WorkloadConfig,
): Script {
  switch (name) {
    case "pan":
    case "overview-pan":
      return panScript(view);
    case "zoom":
    case "overview-zoom":
      return zoomScript(view, cfg);
    case "drag":
      return dragScript(view);
  }
}
