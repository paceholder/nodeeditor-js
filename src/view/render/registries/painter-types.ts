/**
 * Painter contracts. Each is registered on its own, separate from
 * geometry and from the others. Painters are pure functions of their input: they write
 * pixels only, never model state, and keep no state between calls.
 *
 * Canvas state on entry: the context transform is already set for the space named on
 * each input. Node and connection painters are saved/restored around each call by the
 * scene layer. Port glyphs are not (there are many of them): the layer sets `fillStyle`,
 * `strokeStyle` and `lineWidth` before each glyph, and a glyph painter that changes any
 * other state (transform, alpha, dash, clip) must restore it itself.
 */
import type {
  ConnectionRecord,
  GroupRecord,
  NodeRecord,
  PathGeometry,
  Point,
  PortRecord,
  Rect,
  RouteOutcome,
} from "../../../core/index.js";
import type { AssetDrawer } from "../assets/asset-types.js";
import type { DetailPolicy } from "../paint/level-of-detail.js";
import type { PaintFrame } from "../primitives/frame.js";
import type { ResolvedStyle } from "../theme/resolve-style.js";
import type { GroupStyleTokens, ThemeTokens } from "../theme/tokens.js";

export interface DiagnosticBadge {
  readonly severity: "error" | "warning";
}

export interface NodePaintInput {
  readonly node: NodeRecord;
  /** Body box in node-local space (origin at the body center). */
  readonly bounds: Rect<"local">;
  readonly style: ResolvedStyle;
  readonly detail: DetailPolicy;
  /** Local units per CSS pixel when line widths are screen-space, else 1. */
  readonly unit: number;
  /** Draws host-resolved images; painters never load images themselves. */
  readonly assets: AssetDrawer;
  readonly state: {
    readonly selected: boolean;
    readonly hovered: boolean;
    /**
     * An edit of the node still awaits an external authority's answer. The built-in
     * painters ignore it; the look is the host's.
     */
    readonly unconfirmed: boolean;
    readonly diagnostics: readonly DiagnosticBadge[];
  };
}

/** Context transform: node-local space. */
export interface NodePainter {
  paint(ctx: CanvasRenderingContext2D, input: NodePaintInput): void;
  /**
   * The painter draws `state.hovered`, so the scene must repaint when a node it paints
   * enters or leaves hover. Omitted: hover changes do not repaint the scene (no built-in
   * painter draws hover; hover feedback can go on the interaction layer instead).
   */
  readonly repaintOnHover?: boolean;
}

export interface PortGlyphInput {
  readonly port: PortRecord;
  readonly position: Point<"world">;
  /** Outward unit normal in world space. */
  readonly normal: Point<"world">;
  readonly style: ResolvedStyle;
  readonly detail: DetailPolicy;
  readonly unit: number;
  /** An edit of the port still awaits an external authority's answer. */
  readonly unconfirmed: boolean;
}

/** Context transform: world space. No `save`/`restore` around the call (see above). */
export interface PortGlyphPainter {
  paint(ctx: CanvasRenderingContext2D, input: PortGlyphInput): void;
}

export interface ConnectionPaintInput {
  readonly connection: ConnectionRecord;
  readonly path: PathGeometry;
  /** How the route turned out; a painter may mark an unroutable route. */
  readonly route: RouteOutcome;
  readonly style: ResolvedStyle;
  readonly detail: DetailPolicy;
  readonly unit: number;
  readonly selected: boolean;
  /** An edit of the connection still awaits an external authority's answer. */
  readonly unconfirmed: boolean;
}

/** Context transform: world space. */
export interface ConnectionPainter {
  paint(ctx: CanvasRenderingContext2D, input: ConnectionPaintInput): void;
}

export interface GroupFramePaintInput {
  readonly group: GroupRecord;
  /** The whole frame, title strip included. */
  readonly frame: Rect<"world">;
  readonly titleStrip: Rect<"world">;
  /** Where the lock icon goes: a square of constant screen size in the strip's corner. */
  readonly lockBox: Rect<"world">;
  /** The group's colors: theme defaults, then the named style its `style` key selects. */
  readonly style: Readonly<GroupStyleTokens>;
  readonly theme: ThemeTokens;
  /** At the `overview` level a frame is drawn without title and lock icon. */
  readonly detail: DetailPolicy;
  readonly unit: number;
  readonly state: {
    readonly selected: boolean;
    readonly hovered: boolean;
    /** A dragged node will join this group when it is dropped. */
    readonly joinTarget: boolean;
    /** An edit of the group still awaits an external authority's answer. */
    readonly unconfirmed: boolean;
  };
}

/**
 * Paints one group frame beneath connections and nodes. Its own registration: replacing
 * it touches no node, port or connection painter. Context transform: world space; the
 * layer saves and restores around each call.
 */
export interface GroupFramePainter {
  paint(ctx: CanvasRenderingContext2D, input: GroupFramePaintInput): void;
}

/** Fills the whole layer; the context starts in CSS-pixel (viewport) space. */
export type BackgroundPainter = (
  ctx: CanvasRenderingContext2D,
  frame: PaintFrame,
) => void;
