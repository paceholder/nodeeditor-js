/**
 * Card geometry preset (PRE-02, NOD-03).
 *
 * A title bar of `titleHeight` sits at the top of the body. In horizontal layout, ports
 * occupy rows below it: inputs on the left edge, outputs on the right, undirected ports
 * alternating (left first), each side in model port order. Vertical layout puts the two
 * groups on the top and bottom edges, evenly spaced. Painted bounds add `labelMargin`
 * because core does no text measurement; the hit shape is the body only (VIS-03).
 */
import {
  DEFAULT_CAPTURE_RADIUS_PX,
  type NodeGeometry,
  type NodeView,
  type PortAnchor,
} from "../node-geometry.js";
import {
  assignSides,
  type Orientation,
  pointOnSide,
  sideNormal,
  sidesFor,
} from "../port-layout.js";
import { inflateRect } from "../rect.js";
import { rectShape } from "../shapes.js";
import { bodyOf } from "./image-symbol-geometry.js";

export interface CardOptions {
  readonly layout?: Orientation;
  readonly titleHeight?: number;
  readonly rowPitch?: number;
  readonly labelMargin?: number;
  readonly captureRadiusPx?: number;
}

export function createCardGeometry(options: CardOptions = {}): NodeGeometry {
  const layout = options.layout ?? "horizontal";
  const titleHeight = options.titleHeight ?? 28;
  const rowPitch = options.rowPitch ?? 24;
  const labelMargin = options.labelMargin ?? 16;
  const radius = options.captureRadiusPx ?? DEFAULT_CAPTURE_RADIUS_PX;
  return {
    bodyBounds: bodyOf,
    hitShape: (view) => rectShape(bodyOf(view)),
    paintedBounds: (view) => inflateRect(bodyOf(view), labelMargin),
    anchors(view: NodeView): readonly PortAnchor[] {
      const body = bodyOf(view);
      const { first, second } = assignSides(view.ports);
      const [sideA, sideB] = sidesFor(layout);
      const byId = new Map<string, PortAnchor>();
      const place = (list: typeof first, side: typeof sideA): void => {
        list.forEach((port, i) => {
          let position = pointOnSide(side, body, (i + 1) / (list.length + 1));
          if (layout === "horizontal") {
            const y = body.y + titleHeight + rowPitch * (i + 0.5);
            position = { x: position.x, y: Math.min(y, body.y + body.h) };
          }
          byId.set(port.id, {
            portId: port.id,
            position,
            normal: sideNormal(side),
            captureRadiusPx: radius,
          });
        });
      };
      place(first, sideA);
      place(second, sideB);
      return view.ports.flatMap((p) => {
        const a = byId.get(p.id);
        return a ? [a] : [];
      });
    },
  };
}
