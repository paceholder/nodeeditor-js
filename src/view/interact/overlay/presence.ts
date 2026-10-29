/**
 * Presence: remote cursors and selections supplied by the host in world
 * coordinates. Drawn by a built-in interaction painter, so setting presence repaints only
 * the interaction layer and never touches the model or emits model events.
 */
import {
  compose,
  type GeometryScene,
  type NodeId,
  type Point,
  transformRect,
  worldToViewport,
} from "../../../core/index.js";
import type { InteractionPainter } from "../../render/paint/interaction-layer.js";
import { setMatrix } from "../../render/primitives/frame.js";

export type PresenceEntry =
  | {
      readonly id: string;
      readonly kind: "cursor";
      readonly at: Point<"world">;
      readonly color: string;
      readonly label?: string;
    }
  | {
      readonly id: string;
      readonly kind: "selection";
      readonly nodes: readonly NodeId[];
      readonly color: string;
      readonly label?: string;
    };

export interface Presence {
  /** Replace all entries (entries are drawn in the given order). */
  set(entries: readonly PresenceEntry[]): void;
  /** True while any entry exists; such a view must repaint its interaction layer on pan/zoom. */
  readonly active: boolean;
  readonly painter: InteractionPainter;
}

const CURSOR_FONT = "11px system-ui, sans-serif";

export function createPresence(
  scene: () => GeometryScene | undefined,
): Presence {
  let entries: readonly PresenceEntry[] = [];
  return {
    set: (next) => {
      entries = [...next];
    },
    get active() {
      return entries.length > 0;
    },
    painter: {
      order: 100,
      paint(ctx, frame) {
        for (const entry of entries) {
          ctx.save();
          if (entry.kind === "cursor") {
            // Cursor glyphs keep their size on screen: draw in CSS pixels.
            setMatrix(ctx, frame.viewportToDevice);
            const p = worldToViewport(frame.viewport, entry.at);
            ctx.fillStyle = entry.color;
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(p.x + 11, p.y + 4);
            ctx.lineTo(p.x + 4, p.y + 11);
            ctx.closePath();
            ctx.fill();
            if (entry.label)
              drawTag(ctx, entry.label, p.x + 10, p.y + 12, entry.color);
          } else {
            const s = scene();
            for (const id of entry.nodes) {
              const node = s?.node(id);
              if (!node) continue;
              ctx.save();
              setMatrix(ctx, compose(frame.worldToDevice, node.toWorld));
              const b = transformRect(node.toLocal, node.bodyBounds);
              ctx.strokeStyle = entry.color;
              ctx.lineWidth = 2 / frame.viewport.zoom;
              ctx.setLineDash([
                6 / frame.viewport.zoom,
                3 / frame.viewport.zoom,
              ]);
              ctx.strokeRect(b.x, b.y, b.w, b.h);
              ctx.restore();
            }
          }
          ctx.restore();
        }
      },
    },
  };
}

function drawTag(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  color: string,
): void {
  ctx.font = CURSOR_FONT;
  const w = ctx.measureText(text).width + 8;
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, 16);
  ctx.fillStyle = "#ffffff";
  ctx.textBaseline = "middle";
  ctx.fillText(text, x + 4, y + 8.5);
}
