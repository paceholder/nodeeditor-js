/**
 * Dirty-driven frame scheduler.
 *
 * Layers are marked dirty; one animation-frame request is made when the first layer
 * becomes dirty. The frame paints each dirty layer once and clears the set. There is no
 * loop: with nothing dirty, no request is pending or made. Each layer and the after-frame
 * hook run guarded: one that throws is reported and the rest of the frame still runs.
 */
import { rethrowLater } from "./rethrow-later.js";

export type LayerName = "background" | "scene" | "interaction";

/** Fixed paint order within a frame. */
export const LAYER_ORDER: readonly LayerName[] = [
  "background",
  "scene",
  "interaction",
];

export interface FrameClock {
  request(callback: (time: number) => void): number;
  cancel(handle: number): void;
}

export interface FrameScheduler {
  markDirty(...layers: readonly LayerName[]): void;
  /** True while a frame request is outstanding. */
  isPending(): boolean;
  /** Cancel any pending frame and drop dirty marks. Later marks are ignored. */
  dispose(): void;
}

export function createFrameScheduler(
  clock: FrameClock,
  paint: (layer: LayerName, time: number) => void,
  /** Called once after each frame's layers were painted. */
  afterFrame?: (time: number) => void,
  /** A layer (named) or the after-frame hook (no layer) threw; rethrown later by default. */
  onError: (error: unknown, layer?: LayerName) => void = rethrowLater,
): FrameScheduler {
  const dirty = new Set<LayerName>();
  let handle: number | undefined;
  let disposed = false;

  function frame(time: number): void {
    handle = undefined;
    if (disposed) return;
    // Take the dirty set first: painting may mark layers dirty for the next frame.
    const batch = LAYER_ORDER.filter((l) => dirty.has(l));
    dirty.clear();
    for (const layer of batch) {
      try {
        paint(layer, time);
      } catch (error) {
        onError(error, layer);
      }
    }
    try {
      afterFrame?.(time);
    } catch (error) {
      onError(error);
    }
  }

  return {
    markDirty(...layers) {
      if (disposed || layers.length === 0) return;
      for (const l of layers) dirty.add(l);
      if (handle === undefined) handle = clock.request(frame);
    },
    isPending: () => handle !== undefined,
    dispose() {
      disposed = true;
      dirty.clear();
      if (handle !== undefined) clock.cancel(handle);
      handle = undefined;
    },
  };
}
