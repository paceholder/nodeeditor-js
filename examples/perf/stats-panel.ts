/**
 * Live stats panel: plain HTML next to the editor, never drawn on its canvases. A 4 Hz
 * timer reads `renderStats()`; it only touches text nodes whose value changed, and it
 * never invalidates a layer, so it causes no repaint.
 */
import type { ViewHandle } from "@paceholder/nodeeditor-js/view";
import type { FrameSampler } from "./frame-sampler.js";

export const STATS_INTERVAL_MS = 250;

export interface StatsPanel {
  setModelSize(nodes: number, connections: number): void;
  dispose(): void;
}

const fixed = (n: number, digits = 1): string => n.toFixed(digits);

export function createStatsPanel(
  root: HTMLElement,
  view: ViewHandle,
  sampler: FrameSampler,
): StatsPanel {
  const cells = new Map<string, HTMLElement>();
  const text = new Map<string, string>();
  for (const el of root.querySelectorAll<HTMLElement>("[data-stat]")) {
    cells.set(el.dataset.stat ?? "", el);
  }
  const set = (key: string, value: string): void => {
    if (text.get(key) === value) return;
    text.set(key, value);
    const el = cells.get(key);
    if (el) el.textContent = value;
  };

  let model = { nodes: 0, connections: 0 };
  let lastPainted = view.renderStats().framesPainted;
  let lastAt = performance.now();

  const update = (): void => {
    const stats = view.renderStats();
    const now = performance.now();
    const paintedFps =
      ((stats.framesPainted - lastPainted) * 1000) / (now - lastAt);
    if (stats.framesPainted !== lastPainted) sampler.wake();
    lastPainted = stats.framesPainted;
    lastAt = now;

    const recent = sampler.recent();
    set("paintedFps", paintedFps < 0.5 ? "idle" : fixed(paintedFps, 0));
    set("fps", recent ? fixed(recent.fps, 0) : "-");
    set("p50", recent ? `${fixed(recent.p50)} ms` : "-");
    set("p95", recent ? `${fixed(recent.p95)} ms` : "-");
    set("worst", recent ? `${fixed(recent.max)} ms` : "-");
    set("slow", recent ? String(recent.slow) : "-");
    set("background", `${fixed(stats.layers.background.lastPaintMs, 2)} ms`);
    set("scene", `${fixed(stats.layers.scene.lastPaintMs, 2)} ms`);
    set("interaction", `${fixed(stats.layers.interaction.lastPaintMs, 2)} ms`);
    set("nodes", `${stats.nodes.painted} / ${stats.nodes.culled}`);
    set("paths", `${stats.paths.painted} / ${stats.paths.culled}`);
    set(
      "scenePaints",
      `${stats.scenePaints.exact} / ${stats.scenePaints.reused}`,
    );
    set("model", `${model.nodes} nodes, ${model.connections} connections`);
    set("framesPainted", String(stats.framesPainted));
    const vp = view.viewport.get();
    set("zoom", `${fixed(vp.zoom, 3)}`);
    const { dpr } = view.metrics();
    set("dpr", String(dpr));
  };

  const timer = window.setInterval(update, STATS_INTERVAL_MS);
  update();
  return {
    setModelSize(nodes, connections) {
      model = { nodes, connections };
      update();
    },
    dispose() {
      window.clearInterval(timer);
    },
  };
}
