/**
 * DOM overlay slot (OVL-01, REN-03).
 *
 * Host elements (inline editors, menus, node bodies in DOM) live in a div stacked over the
 * canvases. The slot itself ignores pointer input; an attached element takes input only
 * while it is visible. Each element is positioned by a transform computed from its anchor
 * and the current viewport, one pass per frame and only when elements exist.
 */
import {
  type GeometryScene,
  type NodeId,
  type Point,
  type Viewport,
  worldToViewport,
} from "../../../core/index.js";

export type OverlayAnchor =
  | {
      readonly kind: "world";
      readonly point: Point<"world">;
      /** Scale the element with zoom (origin top-left). Default: constant size. */
      readonly scale?: boolean;
    }
  | {
      /** Top-left corner of the node's body bounds; hidden while the node is absent. */
      readonly kind: "node";
      readonly node: NodeId;
      readonly scale?: boolean;
    };

export interface OverlayHandle {
  setAnchor(anchor: OverlayAnchor): void;
  /** A hidden element is `display: none`, so it cannot block input (REN-03). */
  setVisible(visible: boolean): void;
  /** Remove the element from the overlay. Safe to call twice. */
  dispose(): void;
}

export interface OverlayHost {
  attach(element: HTMLElement, anchor: OverlayAnchor): OverlayHandle;
  /** Reposition every attached element for the current viewport and scene. */
  layout(): void;
  readonly count: number;
  dispose(): void;
}

export interface OverlayDeps {
  readonly layer: HTMLElement;
  readonly viewport: () => Viewport;
  readonly scene: () => GeometryScene | undefined;
}

interface Slot {
  readonly element: HTMLElement;
  readonly display: string;
  anchor: OverlayAnchor;
  visible: boolean;
}

export function createOverlayHost(deps: OverlayDeps): OverlayHost {
  const slots = new Set<Slot>();

  function place(slot: Slot): void {
    const { style } = slot.element;
    const origin =
      slot.anchor.kind === "world"
        ? slot.anchor.point
        : deps.scene()?.node(slot.anchor.node)?.bodyBounds;
    if (!slot.visible || !origin) {
      style.display = "none";
      return;
    }
    const v = deps.viewport();
    const at = worldToViewport(v, {
      x: origin.x,
      y: origin.y,
    } as Point<"world">);
    style.display = slot.display;
    style.transform = slot.anchor.scale
      ? `translate(${at.x}px, ${at.y}px) scale(${v.zoom})`
      : `translate(${at.x}px, ${at.y}px)`;
  }

  const host: OverlayHost = {
    attach(element, anchor) {
      const slot: Slot = {
        element,
        display: element.style.display,
        anchor,
        visible: true,
      };
      slots.add(slot);
      element.style.position = "absolute";
      element.style.left = "0";
      element.style.top = "0";
      element.style.transformOrigin = "0 0";
      element.style.pointerEvents = "auto";
      deps.layer.append(element);
      place(slot);
      return {
        setAnchor(next) {
          slot.anchor = next;
          place(slot);
        },
        setVisible(visible) {
          slot.visible = visible;
          place(slot);
        },
        dispose() {
          if (!slots.delete(slot)) return;
          element.remove();
        },
      };
    },
    layout() {
      for (const slot of slots) place(slot);
    },
    get count() {
      return slots.size;
    },
    dispose() {
      for (const slot of slots) slot.element.remove();
      slots.clear();
    },
  };
  return host;
}
