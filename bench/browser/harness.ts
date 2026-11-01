/// <reference types="@vitest/browser-playwright" />
/**
 * Browser harness (design D4): mounts a fixture at 1440x900, drives a scripted workload
 * with real input events, and samples frame intervals, pointer-to-preview latency and
 * picking time. Input is dispatched from a message task right after each frame, which is
 * where a real device's events land relative to the next animation frame.
 */

import type { GraphModel } from "nodeeditor-js";
import type { ViewHandle } from "nodeeditor-js/view";
import { cdp, commands } from "vitest/browser";
import { type FixtureSpec, worldSize } from "../fixtures/fixture-specs.js";
import {
  createFixtureRoutes,
  type FixtureRoutes,
} from "../fixtures/fixture-types.js";
import {
  createFixtureModel,
  mountFixtureView,
} from "../fixtures/fixture-view.js";
import { generateFixture } from "../fixtures/generate-fixture.js";
import { createPrng } from "../fixtures/prng.js";
import { summarize } from "../report/stats.js";
import type { ResultInput } from "../report/write-baseline.js";
import {
  createScript,
  type WorkloadConfig,
  type WorkloadName,
} from "./workloads.js";

export const QUICK = __BENCH_QUICK__;
/** Route mode of the workloads (`BENCH_ROUTES=orthogonal`); labels the result rows. */
export const ROUTES: FixtureRoutes = __BENCH_ROUTES__;
/** Fixture label for result rows: the spec name, plus the route when not the default. */
export const fixtureLabel = (name: string): string =>
  ROUTES === "bezier" ? name : `${name} ${ROUTES}`;
/** Workload length, repeats and warm-up (design D4; quick runs are for iteration only). */
export const DURATION_MS = QUICK ? 5_000 : 30_000;
export const REPEATS = QUICK ? 1 : 3;
export const WARMUP_MS = 1_000;
/** Input arrival phase within a frame (see `runWorkload`). */
const DEFAULT_FRAME_MS = 16.7;
const PHASE_SEED = 5;
export const VIEW_SIZE = { width: 1440, height: 900 } as const;

export interface Samples {
  readonly frameIntervalMs: number[];
  readonly latencyMs: number[];
  readonly pickMs: number[];
  nodes: number;
  paths: number;
}

export interface Mounted {
  readonly view: ViewHandle;
  readonly model: GraphModel;
  readonly dispose: () => void;
}

/** Wait for `ms` of wall time using animation frames, so paints can settle. */
export function settle(ms: number): Promise<void> {
  return new Promise((resolve) => {
    const end = performance.now() + ms;
    const tick = (): void =>
      performance.now() >= end ? resolve() : void requestAnimationFrame(tick);
    requestAnimationFrame(tick);
  });
}

/** A viewport centring the fixture's world at `zoom`. */
export function centred(spec: FixtureSpec, zoom: number) {
  const { w, h } = worldSize(spec);
  return {
    zoom,
    panX: VIEW_SIZE.width / 2 - (w / 2) * zoom,
    panY: VIEW_SIZE.height / 2 - (h / 2) * zoom,
  };
}

/** Headed runs emulate viewport and ratio here (see vitest.bench.config.ts). */
async function emulateMetrics(): Promise<void> {
  if (__BENCH_EMULATE_DPR__ === 0) return;
  await cdp().send("Emulation.setDeviceMetricsOverride", {
    width: VIEW_SIZE.width,
    height: VIEW_SIZE.height,
    deviceScaleFactor: __BENCH_EMULATE_DPR__,
    mobile: false,
  });
  await settle(300);
}

export async function mountFixture(
  spec: FixtureSpec,
  seed: number,
  zoom: number,
  routes: FixtureRoutes = ROUTES,
): Promise<Mounted> {
  await emulateMetrics();
  if (
    window.innerWidth < VIEW_SIZE.width ||
    window.innerHeight < VIEW_SIZE.height
  )
    throw new Error(
      `browser viewport ${window.innerWidth}x${window.innerHeight} is smaller than 1440x900`,
    );
  const host = document.createElement("div");
  host.style.cssText = `position:fixed;left:0;top:0;width:${VIEW_SIZE.width}px;height:${VIEW_SIZE.height}px;`;
  document.body.append(host);
  const model = createFixtureModel(generateFixture(spec, seed));
  const view = mountFixtureView(host, model, {
    initialViewport: centred(spec, zoom),
    routes: createFixtureRoutes(routes),
  });
  await settle(1_500); // first paint plus asynchronous symbol decoding
  return {
    view,
    model,
    dispose() {
      view.dispose();
      host.remove();
    },
  };
}

/** Run one script for warm-up plus `durationMs`, recording after the warm-up. */
export function runWorkload(
  view: ViewHandle,
  name: WorkloadName,
  cfg: WorkloadConfig,
  durationMs: number,
): Promise<Samples> {
  return new Promise((resolve) => {
    const script = createScript(name, view, cfg);
    const samples: Samples = {
      frameIntervalMs: [],
      latencyMs: [],
      pickMs: [],
      nodes: 0,
      paths: 0,
    };
    const pending: Array<{ seq: number; at: number }> = [];
    const channel = new MessageChannel();
    const start = performance.now();
    let lastFrame: number | undefined;
    let frameMs = DEFAULT_FRAME_MS; // the display period, as last observed
    let seq = 0;
    let done = false;

    const dispatch = (): void => {
      if (done) return;
      const now = performance.now();
      seq++;
      view.noteInput(seq);
      pending.push({ seq, at: now });
      const pointer = script.step(now - start);
      if (pointer && now - start >= WARMUP_MS) {
        const t0 = performance.now();
        view.pick(pointer.x, pointer.y);
        samples.pickMs.push(performance.now() - t0);
      }
    };
    // A device event lands at a uniformly random point of a frame and is delivered at the
    // next frame start; dispatching after a random delay reproduces that arrival phase.
    // Dispatching right after the frame would always measure the worst case.
    const phase = createPrng(PHASE_SEED);
    channel.port1.onmessage = () => {
      setTimeout(dispatch, 1 + phase.next() * Math.max(0, frameMs - 3));
    };

    const frame = (stamp: number): void => {
      const now = performance.now();
      const recording = now - start >= WARMUP_MS;
      if (lastFrame !== undefined && recording)
        samples.frameIntervalMs.push(stamp - lastFrame);
      if (lastFrame !== undefined) frameMs = Math.min(stamp - lastFrame, 50);
      lastFrame = stamp;
      const stats = view.renderStats();
      // Resolved when the frame after the painting one begins: the presentation time.
      while (pending[0] && pending[0].seq <= stats.lastPaintedInputSeq) {
        const p = pending.shift();
        if (p && recording) samples.latencyMs.push(now - p.at);
      }
      if (recording) {
        samples.nodes = Math.max(samples.nodes, stats.nodes.painted);
        samples.paths = Math.max(samples.paths, stats.paths.painted);
      }
      if (now - start >= WARMUP_MS + durationMs) {
        done = true;
        channel.port1.close();
        script.finish();
        resolve(samples);
        return;
      }
      requestAnimationFrame(frame);
      channel.port2.postMessage(0);
    };
    requestAnimationFrame(frame);
  });
}

export function mergeSamples(parts: readonly Samples[]): Samples {
  return {
    frameIntervalMs: parts.flatMap((p) => p.frameIntervalMs),
    latencyMs: parts.flatMap((p) => p.latencyMs),
    pickMs: parts.flatMap((p) => p.pickMs),
    nodes: Math.max(0, ...parts.map((p) => p.nodes)),
    paths: Math.max(0, ...parts.map((p) => p.paths)),
  };
}

/** Result rows (frame interval, latency, picking) for one workload's samples. */
export function toInputs(
  workload: string,
  fixture: string,
  s: Samples,
): ResultInput[] {
  const common = {
    workload,
    fixture,
    runtime: "browser" as const,
    dpr: window.devicePixelRatio,
    visible: { nodes: s.nodes, paths: s.paths },
  };
  const metrics: Array<[string, number[]]> = [
    ["frameIntervalMs", s.frameIntervalMs],
    ["latencyMs", s.latencyMs],
    ["pickMs", s.pickMs],
  ];
  return metrics
    .filter(([, values]) => values.length > 0)
    .map(([metric, values]) => ({
      ...common,
      metric,
      summary: summarize(values),
    }));
}

export interface BrowserInfoRaw {
  readonly name: string;
  readonly version: string;
  readonly headless: boolean;
}

/** The browser actually running: name from its brand list, full version when exposed. */
export async function browserInfo(): Promise<BrowserInfoRaw> {
  const ua = navigator.userAgent;
  const data = (
    navigator as Navigator & {
      userAgentData?: {
        getHighEntropyValues(hints: string[]): Promise<{
          fullVersionList?: Array<{ brand: string; version: string }>;
        }>;
      };
    }
  ).userAgentData;
  const list = (await data?.getHighEntropyValues(["fullVersionList"]))
    ?.fullVersionList;
  const chrome = list?.find((b) => /^(Google Chrome|Chromium)$/.test(b.brand));
  const fallback = /Chrome\/(\S+)/.exec(ua)?.[1] ?? "unknown";
  const isChrome = chrome?.brand === "Google Chrome";
  return {
    name: isChrome || /Chrome\//.test(ua) ? "chrome" : "unknown",
    version: chrome?.version ?? fallback,
    headless: /HeadlessChrome/.test(ua),
  };
}

/** Write a JSON result through the browser-mode server file command. */
export async function saveBrowserResult(
  file: string,
  data: unknown,
): Promise<void> {
  await commands.writeFile(
    `bench/.results/${file}.json`,
    `${JSON.stringify(data, null, 2)}\n`,
  );
}
