/**
 * Anchored node overlay: React children portaled into one overlay slot that sits
 * at a node. The slot is attached on mount, removed on unmount and hidden while the node
 * is absent. Meant for a handful of nodes at a time, not one per node of the whole graph.
 */
import { type ReactNode, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { NodeId } from "../core/index.js";
import type {
  OverlayAnchor,
  OverlayHandle,
  OverlayPlacement,
} from "../view/index.js";
import { useEditor, useEditorSlot } from "./editor-context.js";
import { useNode } from "./use-entity.js";

export interface NodeOverlayProps {
  readonly node: NodeId;
  /** Where the content sits relative to the node's body. Default `"top-left"`. */
  readonly placement?: OverlayPlacement;
  /** Gap in CSS pixels for the edge placements. */
  readonly offset?: number;
  /** Scale the content with zoom instead of keeping its size. */
  readonly scale?: boolean;
  /**
   * Called once when the anchored node is removed from the model while the editor shows
   * it. Unmounting the editor or swapping its model is not a removal.
   */
  readonly onNodeGone?: () => void;
  readonly children?: ReactNode;
}

function anchorOf(
  p: Pick<NodeOverlayProps, "node"> & {
    placement?: OverlayPlacement | undefined;
    offset?: number | undefined;
    scale?: boolean | undefined;
  },
): OverlayAnchor {
  return {
    kind: "node",
    node: p.node,
    ...(p.placement !== undefined && { placement: p.placement }),
    ...(p.offset !== undefined && { offset: p.offset }),
    ...(p.scale !== undefined && { scale: p.scale }),
  };
}

export function NodeOverlay(props: NodeOverlayProps): ReactNode {
  const { node, placement, offset, scale } = props;
  const anchor = useRef(anchorOf(props));
  const view = useEditor();
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  const handle = useRef<OverlayHandle | null>(null);

  useEffect(() => {
    if (!view) return;
    const element = document.createElement("div");
    handle.current = view.overlay.attach(element, anchor.current);
    setSlot(element);
    return () => {
      handle.current?.dispose();
      handle.current = null;
      setSlot(null);
    };
    // The anchor, node included, is updated in place below; only a new view restarts the slot.
  }, [view]);

  useEffect(() => {
    anchor.current = anchorOf({ node, placement, offset, scale });
    handle.current?.setAnchor(anchor.current);
  }, [node, placement, offset, scale]);

  const { model } = useEditorSlot();
  const present = useNode(node) !== undefined;
  const watched = useRef<{ model: unknown; node: NodeId; present: boolean }>({
    model: undefined,
    node,
    present: false,
  });
  const onGone = useRef(props.onNodeGone);
  useEffect(() => {
    onGone.current = props.onNodeGone;
  });
  useEffect(() => {
    const was = watched.current;
    // A new model, a new node or no editor at all starts the watch over: only a removal
    // from the model being shown counts as the node going away.
    const sameWatch =
      model !== undefined && was.model === model && was.node === node;
    watched.current = { model, node, present: model !== undefined && present };
    if (sameWatch && was.present && !present) onGone.current?.();
  }, [model, node, present]);

  return slot ? createPortal(props.children, slot) : null;
}
