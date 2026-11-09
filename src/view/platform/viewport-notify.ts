/**
 * Frame-coalesced viewport change notification. Pointer samples may move the
 * viewport many times per frame; subscribers hear about it once, after the frame, and
 * only when the viewport differs from the one they last heard about.
 */

import type { Viewport } from "../../core/index.js";
import { rethrowLater } from "./rethrow-later.js";

export interface ViewportNotifier {
  /** Subscribe; returns the unsubscribe function. */
  on(handler: (viewport: Viewport) => void): () => void;
  /** The viewport changed; the next `flush` decides whether to notify. */
  markChanged(): void;
  /** Call once per frame, after painting. */
  flush(): void;
  clear(): void;
}

const same = (a: Viewport, b: Viewport): boolean =>
  a.zoom === b.zoom && a.panX === b.panX && a.panY === b.panY;

export function createViewportNotifier(
  get: () => Viewport,
  initial: Viewport,
  report: (error: unknown) => void = rethrowLater,
): ViewportNotifier {
  const handlers = new Set<(viewport: Viewport) => void>();
  let pending = false;
  let heard = initial;
  return {
    on(handler) {
      // A wrapper per subscription, so subscribing one function twice unsubscribes once.
      const entry = (v: Viewport) => handler(v);
      handlers.add(entry);
      return () => void handlers.delete(entry);
    },
    markChanged() {
      pending = true;
    },
    flush() {
      if (!pending) return;
      pending = false;
      const now = get();
      if (same(now, heard)) return;
      heard = now;
      for (const h of [...handlers]) {
        try {
          h(now);
        } catch (error) {
          report(error);
        }
      }
    },
    clear() {
      handlers.clear();
      pending = false;
    },
  };
}
