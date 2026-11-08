/**
 * DOM overlay slot.
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
import { type OverlayPlacement, placeAtNode } from "./placement.js";

export type OverlayAnchor =
  | {
      readonly kind: "world";
      readonly point: Point<"world">;
      /** Scale the element with zoom (origin top-left). Default: constant size. */
      readonly scale?: boolean;
    }
  | {
      /** A spot on the node's body bounds; hidden while the node is absent. */
      readonly kind: "node";
      readonly node: NodeId;
      readonly scale?: boolean;
      /** Where the element sits relative to the body bounds. Default `"top-left"`. */
      readonly placement?: OverlayPlacement;
      /**
       * Gap in CSS pixels between the body and the element for the edge placements
       * ("top", "bottom", "left", "right"). Constant at any zoom; default 0.
       */
      readonly offset?: number;
    }
  | {
      /** A fixed point of the view (a context menu): it stays put while the view pans and zooms. */
      readonly kind: "viewport";
      readonly point: Point<"viewport">;
    };

export interface OverlayHandle {
  setAnchor(anchor: OverlayAnchor): void;
  /** A hidden element is `display: none`, so it cannot block input. */
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

  /** Viewport point of the anchor plus the shift (CSS) back by a share of the element. */
  function resolve(
    anchor: OverlayAnchor,
    v: Viewport,
  ): { at: Point<"viewport">; shift: string } | undefined {
    if (anchor.kind === "viewport") return { at: anchor.point, shift: "" };
    if (anchor.kind === "world") {
      return { at: worldToViewport(v, anchor.point), shift: "" };
    }
    const body = deps.scene()?.node(anchor.node)?.bodyBounds;
    if (!body) return undefined;
    const placed = placeAtNode(body, v, anchor.placement, anchor.offset);
    const moved = placed.shiftX !== 0 || placed.shiftY !== 0;
    return {
      at: placed.at,
      shift: moved
        ? ` translate(${placed.shiftX * 100}%, ${placed.shiftY * 100}%)`
        : "",
    };
  }

  function place(slot: Slot): void {
    const { style } = slot.element;
    const { anchor } = slot;
    const v = deps.viewport();
    const spot = slot.visible ? resolve(anchor, v) : undefined;
    if (!spot) {
      style.display = "none";
      return;
    }
    style.display = slot.display;
    // The shift comes last so its percentages refer to the element's scaled size.
    style.transform =
      anchor.kind !== "viewport" && anchor.scale
        ? `translate(${spot.at.x}px, ${spot.at.y}px) scale(${v.zoom})${spot.shift}`
        : `translate(${spot.at.x}px, ${spot.at.y}px)${spot.shift}`;
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
