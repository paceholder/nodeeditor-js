/**
 * Render statistics: counts and timings only, no scene data. The benchmark
 * harness reads them through `ViewHandle.renderStats()`.
 */
import type { LayerName } from "./frame-scheduler.js";

export interface RenderStats {
  readonly layers: Readonly<
    Record<LayerName, { readonly lastPaintMs: number }>
  >;
  /** From the last scene paint: drawn this frame versus in the model but outside it. */
  readonly nodes: { readonly painted: number; readonly culled: number };
  readonly paths: { readonly painted: number; readonly culled: number };
  /** Animation frames in which at least one layer was painted. */
  readonly framesPainted: number;
  /**
   * The most recent sequence number given to `noteInput` before the last painted frame
   * began; 0 until one is painted.
   */
  readonly lastPaintedInputSeq: number;
}

export interface StatsRecorder {
  layerPainted(layer: LayerName, ms: number): void;
  scenePainted(
    painted: { nodes: number; connections: number },
    totals: { nodes: number; connections: number },
  ): void;
  /** Call once per animation frame, after its layers were painted. */
  frameEnd(): void;
  noteInput(seq: number): void;
  snapshot(): RenderStats;
}

export function createStatsRecorder(): StatsRecorder {
  const ms: Record<LayerName, number> = {
    background: 0,
    scene: 0,
    interaction: 0,
  };
  let nodes = { painted: 0, culled: 0 };
  let paths = { painted: 0, culled: 0 };
  let frames = 0;
  let paintedThisFrame = false;
  let noted = 0;
  let framePending = 0;
  let lastPainted = 0;
  return {
    layerPainted(layer, duration) {
      if (!paintedThisFrame) framePending = noted;
      paintedThisFrame = true;
      ms[layer] = duration;
    },
    scenePainted(painted, totals) {
      nodes = {
        painted: painted.nodes,
        culled: Math.max(0, totals.nodes - painted.nodes),
      };
      paths = {
        painted: painted.connections,
        culled: Math.max(0, totals.connections - painted.connections),
      };
    },
    frameEnd() {
      if (!paintedThisFrame) return;
      paintedThisFrame = false;
      frames++;
      lastPainted = framePending;
    },
    noteInput(seq) {
      noted = seq;
    },
    snapshot: () => ({
      layers: {
        background: { lastPaintMs: ms.background },
        scene: { lastPaintMs: ms.scene },
        interaction: { lastPaintMs: ms.interaction },
      },
      nodes,
      paths,
      framesPainted: frames,
      lastPaintedInputSeq: lastPainted,
    }),
  };
}
