/**
 * Interaction layer: previews, marquee, candidate highlights, presence. Tools
 * add ordered painters and call `invalidate()` while a gesture changes; nothing here
 * touches the model, and invalidating repaints this layer only.
 */
import { rethrowLater } from "../../platform/rethrow-later.js";
import type { PaintFrame } from "../primitives/frame.js";
import { setMatrix } from "../primitives/frame.js";

export interface InteractionPainter {
  /** Lower paints first. Equal orders keep insertion order. Default 0. */
  readonly order?: number;
  /**
   * Context starts in world space (`frame.worldToDevice`); call
   * `ctx.setTransform` with `frame.viewportToDevice` to draw in CSS pixels.
   */
  paint(ctx: CanvasRenderingContext2D, frame: PaintFrame): void;
}

export interface InteractionLayer {
  /** Add a painter and request a repaint; returns the remover. */
  add(painter: InteractionPainter): () => void;
  /** Request an interaction-layer repaint (explicit invalidation). */
  invalidate(): void;
  /** Paint every painter in order; one that throws goes to `fault` and the rest still paint. */
  paint(
    ctx: CanvasRenderingContext2D,
    frame: PaintFrame,
    fault?: (error: unknown) => void,
  ): void;
  readonly size: number;
}

export function createInteractionLayer(
  requestRepaint: () => void,
): InteractionLayer {
  // Kept sorted by (order, insertion): inserting after equal orders is stable.
  const painters: InteractionPainter[] = [];
  return {
    add(painter) {
      const order = painter.order ?? 0;
      let at = painters.length;
      while (at > 0 && (painters[at - 1]?.order ?? 0) > order) at--;
      painters.splice(at, 0, painter);
      requestRepaint();
      return () => {
        const i = painters.indexOf(painter);
        if (i < 0) return;
        painters.splice(i, 1);
        requestRepaint();
      };
    },
    invalidate: requestRepaint,
    paint(ctx, frame, fault = rethrowLater) {
      for (const painter of [...painters]) {
        ctx.save();
        try {
          setMatrix(ctx, frame.worldToDevice);
          painter.paint(ctx, frame);
        } catch (error) {
          fault(error);
        } finally {
          ctx.restore();
        }
      }
    },
    get size() {
      return painters.length;
    },
  };
}
