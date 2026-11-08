/**
 * Hover payload: plain data by stable IDs, no DOM event, so a host can
 * build tooltips, popovers and cross-panel highlights from it.
 */
import type { ConnectionId, NodeId, PortId } from "../../../core/index.js";
import type { ViewRect } from "../../platform/view-rect.js";

/** The entity under the pointer. Ports are reported only while they are pickable. */
export type HoverTarget =
  | { readonly kind: "node"; readonly node: NodeId }
  | { readonly kind: "port"; readonly node: NodeId; readonly port: PortId }
  | {
      readonly kind: "connection";
      readonly connection: ConnectionId;
      /** The hit member of a composite connection, when the picker reports one. */
      readonly member?: string;
    };

/**
 * Raised when the hovered entity changes. `target` is `null` in the leave form. `rect` is
 * set for a node target: the node's body bounds in client pixels at the moment of the
 * event, so a popover can be placed without a second query.
 */
export interface HoverEvent {
  readonly target: HoverTarget | null;
  readonly rect?: ViewRect;
}
