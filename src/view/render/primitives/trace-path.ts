/**
 * Path tracing shared by connection painters, decorations, the overview and the connect
 * preview: one place that turns a `PathGeometry` into canvas path commands.
 */
import type { PathGeometry, Point } from "../../../core/index.js";

/** Add the path to the current canvas path. Exhaustive over `PathGeometry`. */
export function tracePath(
  ctx: CanvasRenderingContext2D,
  path: PathGeometry,
): void {
  ctx.moveTo(path.p0.x, path.p0.y);
  switch (path.kind) {
    case "line":
      ctx.lineTo(path.p1.x, path.p1.y);
      return;
    case "cubic":
      ctx.bezierCurveTo(
        path.c1.x,
        path.c1.y,
        path.c2.x,
        path.c2.y,
        path.p1.x,
        path.p1.y,
      );
      return;
    case "polyline": {
      // Rounded corners use the fitted radii, so `arcTo` draws exactly the arc that
      // picking and bounds measure.
      const { via, radii } = path;
      for (let i = 0; i < via.length; i++) {
        const v = via[i] as Point<"world">;
        const r = radii?.[i] ?? 0;
        const next = (via[i + 1] ?? path.p1) as Point<"world">;
        if (r > 0) ctx.arcTo(v.x, v.y, next.x, next.y, r);
        else ctx.lineTo(v.x, v.y);
      }
      ctx.lineTo(path.p1.x, path.p1.y);
      return;
    }
  }
}
