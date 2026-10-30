/**
 * Stress actions (task 8.3). Each action drives the view for a fixed time, with the frame
 * sampler recording every frame interval, and returns a one-line summary for the panel.
 * Navigation uses the viewport API; the selection move uses real pointer events so the
 * move tool and its preview are exercised; the live stream submits batch patches to the
 * model the way a host adapter would.
 */
import type { GraphModel, PatchOp } from "nodeeditor-js";
import { COMMAND_IDS, nodeKey, type ViewHandle } from "nodeeditor-js/view";
import { createPrng } from "../../bench/fixtures/prng.js";
import {
  type FrameSampler,
  type IntervalStats,
  summarizeIntervals,
} from "./frame-sampler.js";

export interface StressContext {
  readonly view: ViewHandle;
  readonly model: GraphModel;
  readonly sampler: FrameSampler;
  readonly signal: AbortSignal;
}

export interface StressAction {
  readonly id: string;
  readonly label: string;
  run(ctx: StressContext): Promise<string>;
}

const nextFrame = (): Promise<number> =>
  new Promise((resolve) => requestAnimationFrame(resolve));

/** Call `step(elapsedMs)` every animation frame for `ms`, or until aborted. */
async function perFrame(
  ctx: StressContext,
  ms: number,
  step: (elapsed: number, dt: number) => void,
): Promise<void> {
  let prev = await nextFrame();
  const start = prev;
  while (!ctx.signal.aborted) {
    const stamp = await nextFrame();
    if (stamp - start >= ms) return;
    step(stamp - start, stamp - prev);
    prev = stamp;
  }
}

function describe(name: string, s: IntervalStats, extra = ""): string {
  return `${name}: ${s.fps.toFixed(0)} fps, p95 ${s.p95.toFixed(1)} ms, p99 ${s.p99.toFixed(1)} ms, worst ${s.max.toFixed(1)} ms, ${s.slow}/${s.frames} slow${extra}`;
}

async function measured(
  ctx: StressContext,
  name: string,
  body: () => Promise<string>,
): Promise<string> {
  ctx.sampler.wake();
  ctx.sampler.beginRun();
  const extra = await body();
  const stats = ctx.sampler.endRun();
  return `${describe(name, stats)}${extra}${ctx.signal.aborted ? " (stopped)" : ""}`;
}

const center = (view: ViewHandle) => {
  const { width, height } = view.metrics();
  return { x: width / 2, y: height / 2 };
};

/** Fit-all down to 1:1 and back, zooming about the view centre. */
const zoomSweep: StressAction = {
  id: "zoom",
  label: "Zoom sweep",
  async run(ctx) {
    const { view } = ctx;
    view.commands.run(COMMAND_IDS.fitAll);
    await nextFrame();
    const fit = view.viewport.get().zoom;
    const lo = Math.min(fit, 1);
    const hi = Math.max(fit, 1) < lo * 2 ? lo * 4 : Math.max(fit, 1);
    return measured(ctx, "Zoom sweep", async () => {
      // Two round trips of 3 s each between the two ends, eased in log space.
      await perFrame(ctx, 12_000, (t) => {
        const phase = 0.5 - 0.5 * Math.cos((2 * Math.PI * t) / 6000);
        const target = Math.exp(
          Math.log(lo) + (Math.log(hi) - Math.log(lo)) * phase,
        );
        const factor = target / view.viewport.get().zoom;
        if (Math.abs(factor - 1) > 1e-6)
          view.viewport.zoomAt(center(view), factor);
      });
      return "";
    });
  },
};

/** Constant-speed pan along a wide circle at 1:1. */
const continuousPan: StressAction = {
  id: "pan",
  label: "Continuous pan",
  async run(ctx) {
    const { view } = ctx;
    const speed = 700; // px per second
    const turn = 0.5; // rad per second, a circle 1400 px in radius
    return measured(ctx, "Continuous pan", async () => {
      await perFrame(ctx, 12_000, (t, dt) => {
        const angle = (turn * t) / 1000;
        const step = (speed * dt) / 1000;
        view.viewport.panBy(-Math.cos(angle) * step, -Math.sin(angle) * step);
      });
      return "";
    });
  },
};

function pointer(
  view: ViewHandle,
  type: "pointerdown" | "pointermove" | "pointerup",
  x: number,
  y: number,
): void {
  view.element.dispatchEvent(
    new PointerEvent(type, {
      pointerId: 1,
      pointerType: "mouse",
      isPrimary: true,
      clientX: x,
      clientY: y,
      button: 0,
      buttons: type === "pointerup" ? 0 : 1,
      bubbles: true,
      cancelable: true,
      composed: true,
    }),
  );
}

const MAX_SELECTED = 2000;

/** Select what is on screen and drag it around: one move gesture with a big preview. */
const moveSelection: StressAction = {
  id: "move",
  label: "Move selection",
  async run(ctx) {
    const { view, model } = ctx;
    const vp0 = view.viewport.get();
    // Nodes must be big enough on screen to grab: zoom in to at least 0.5 about the centre.
    if (vp0.zoom < 0.5) view.viewport.zoomAt(center(view), 0.5 / vp0.zoom);
    await nextFrame();
    const vp = view.viewport.get();
    const { width, height } = view.metrics();
    const world = {
      x0: -vp.panX / vp.zoom,
      y0: -vp.panY / vp.zoom,
      x1: (width - vp.panX) / vp.zoom,
      y1: (height - vp.panY) / vp.zoom,
    };
    const onScreen = model.reader
      .nodes()
      .filter(
        (n) =>
          n.position.x > world.x0 &&
          n.position.x < world.x1 &&
          n.position.y > world.y0 &&
          n.position.y < world.y1,
      )
      .slice(0, MAX_SELECTED);
    view.selection.replace(onScreen.map((n) => nodeKey(n.id)));
    await nextFrame();
    // Grab the selected node nearest the centre.
    const rect = view.element.getBoundingClientRect();
    const c = center(view);
    let grab: { x: number; y: number; d: number } | undefined;
    for (let dy = -200; dy <= 200; dy += 5) {
      for (let dx = -200; dx <= 200; dx += 5) {
        const hit = view.pick(rect.left + c.x + dx, rect.top + c.y + dy)[0];
        const d = dx * dx + dy * dy;
        if (
          hit?.kind === "node" &&
          view.selection.has(nodeKey(hit.nodeId)) &&
          (!grab || d < grab.d)
        )
          grab = { x: rect.left + c.x + dx, y: rect.top + c.y + dy, d };
      }
    }
    if (!grab)
      return "Move selection: no selected node near the centre to grab";
    const origin = grab;
    return measured(
      ctx,
      `Move selection (${onScreen.length} nodes)`,
      async () => {
        pointer(view, "pointerdown", origin.x, origin.y);
        let at = origin;
        await perFrame(ctx, 8_000, (t) => {
          const w = (2 * Math.PI * t) / 4000;
          at = {
            ...origin,
            x: origin.x + 160 * Math.sin(w),
            y: origin.y + 90 * Math.sin(2 * w),
          };
          pointer(view, "pointermove", at.x, at.y);
        });
        const t0 = performance.now();
        pointer(view, "pointerup", at.x, at.y);
        const commit = performance.now() - t0;
        return `, commit ${commit.toFixed(1)} ms`;
      },
    );
  },
};

const STATUSES = ["ok", "warning", "error"] as const;
const LIVE_PERIOD_MS = 1000 / 30;
const LIVE_COUNT = 1000;

/** F-LIVE style stream: 1k node status updates at 30 Hz as one patch per tick, no history. */
const liveStream: StressAction = {
  id: "live",
  label: "Live status stream",
  async run(ctx) {
    const { model } = ctx;
    const nodes = model.reader.nodes();
    const count = Math.min(LIVE_COUNT, nodes.length);
    const prng = createPrng(11);
    const submitMs: number[] = [];
    let ticks = 0;
    let dropped = 0;
    return measured(
      ctx,
      `Live status stream (${count} nodes at 30 Hz)`,
      async () => {
        const start = performance.now();
        let due = start;
        while (!ctx.signal.aborted && performance.now() - start < 10_000) {
          due += LIVE_PERIOD_MS;
          const wait = due - performance.now();
          // Behind schedule: coalesce by skipping whole ticks instead of queueing them.
          if (wait < -LIVE_PERIOD_MS) {
            const skipped = Math.floor(-wait / LIVE_PERIOD_MS);
            dropped += skipped;
            due += skipped * LIVE_PERIOD_MS;
          } else if (wait > 0) {
            await new Promise((r) => setTimeout(r, wait));
          }
          const ops: PatchOp[] = [];
          for (let i = 0; i < count; i++) {
            const node = nodes[prng.int(nodes.length)];
            if (!node) continue;
            const next = STATUSES[prng.int(STATUSES.length)] ?? "ok";
            const current = model.reader.getNode(node.id)?.status;
            if (current === next) continue;
            ops.push({
              op: "update",
              entity: "node",
              id: node.id,
              fields: {
                status:
                  current === undefined
                    ? { new: next }
                    : { old: current, new: next },
              },
            });
          }
          const t0 = performance.now();
          model.submit({ ops }, { history: "skip", label: "Status update" });
          submitMs.push(performance.now() - t0);
          ticks++;
        }
        const s = summarizeIntervals(submitMs);
        return `, ${ticks} ticks, patch apply p50 ${s.p50.toFixed(1)} ms p95 ${s.p95.toFixed(1)} ms, ${dropped} ticks coalesced`;
      },
    );
  },
};

export const STRESS_ACTIONS: readonly StressAction[] = [
  zoomSweep,
  continuousPan,
  moveSelection,
  liveStream,
];
