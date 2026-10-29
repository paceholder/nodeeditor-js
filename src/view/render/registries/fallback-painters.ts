/**
 * Fallback painters (task 3.1): what is drawn when nothing is registered for a key. The
 * placeholder box, a round port dot, and a stroked path. Presets replace them later;
 * they exist so an unconfigured view still shows the graph.
 */
import { placeholderNodePainter } from "../primitives/placeholder.js";
import { tracePath } from "../primitives/trace-path.js";
import type {
  ConnectionPainter,
  NodePainter,
  PortGlyphPainter,
} from "./painter-types.js";

/** Unregistered node types show the placeholder. */
export const fallbackNodePainter: NodePainter = placeholderNodePainter;

/** A plain rounded box with a centered title; handy for hosts and tests. */
export const boxNodePainter: NodePainter = {
  paint(ctx, { node, bounds, style, detail, unit }) {
    ctx.beginPath();
    ctx.roundRect(bounds.x, bounds.y, bounds.w, bounds.h, style.nodeRadius);
    ctx.fillStyle = style.nodeFill;
    ctx.fill();
    ctx.lineWidth = style.nodeLineWidth * unit;
    ctx.strokeStyle = style.nodeStroke;
    ctx.stroke();
    if (detail.title && node.title) {
      ctx.fillStyle = style.textColor;
      ctx.font = style.font;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(
        node.title,
        bounds.x + bounds.w / 2,
        bounds.y + bounds.h / 2,
      );
    }
  },
};

export const fallbackPortGlyphPainter: PortGlyphPainter = {
  paint(ctx, { position, style, unit }) {
    const r = style.portRadius * unit;
    ctx.beginPath();
    if (style.portShape === "square") {
      ctx.rect(position.x - r, position.y - r, 2 * r, 2 * r);
    } else {
      ctx.arc(position.x, position.y, r, 0, Math.PI * 2);
    }
    ctx.fillStyle = style.portFill;
    ctx.fill();
    ctx.lineWidth = unit;
    ctx.strokeStyle = style.portStroke;
    ctx.stroke();
  },
};

export const fallbackConnectionPainter: ConnectionPainter = {
  paint(ctx, { path, style, unit }) {
    ctx.beginPath();
    tracePath(ctx, path);
    ctx.lineWidth = style.connectionWidth * unit;
    ctx.lineCap = "round";
    ctx.strokeStyle = style.connectionColor;
    ctx.stroke();
    // Endpoint dots stay visible at every detail level.
    const r = style.connectionWidth * unit * 1.25;
    ctx.fillStyle = style.connectionColor;
    ctx.beginPath();
    ctx.arc(path.p0.x, path.p0.y, r, 0, Math.PI * 2);
    ctx.arc(path.p1.x, path.p1.y, r, 0, Math.PI * 2);
    ctx.fill();
  },
};
