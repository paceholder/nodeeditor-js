import {
  NodeOverlay,
  useHover,
  useNode,
} from "@paceholder/nodeeditor-js/react";

/** A popover anchored above the hovered node; the overlay keeps it attached while panning. */
export function HoverPopover() {
  const hover = useHover();
  if (hover?.kind !== "node") return null;
  return (
    <NodeOverlay node={hover.node} placement="top" offset={6}>
      <Label id={hover.node} />
    </NodeOverlay>
  );
}

function Label({ id }: { id: Parameters<typeof useNode>[0] }) {
  const node = useNode(id);
  return <div className="hover-popover">{node?.title ?? "…"}</div>;
}
