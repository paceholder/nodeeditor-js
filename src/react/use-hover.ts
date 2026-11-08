/** Hover hook: the entity under the pointer; re-renders only when it changes. */
import { useMemo } from "react";
import type { HoverTarget } from "../view/index.js";
import { useEditor } from "./editor-context.js";
import { useExternalValue } from "./use-external-value.js";

function same(a: HoverTarget | null, b: HoverTarget | null): boolean {
  if (a === b) return true;
  if (!a || !b || a.kind !== b.kind) return false;
  if (a.kind === "node" && b.kind === "node") return a.node === b.node;
  if (a.kind === "port" && b.kind === "port") {
    return a.node === b.node && a.port === b.port;
  }
  if (a.kind === "connection" && b.kind === "connection") {
    return a.connection === b.connection && a.member === b.member;
  }
  return false;
}

/**
 * The hovered node, port or connection, or null. A host that wants a delay before showing
 * a tooltip keeps it on its side; use `view.on("hover")` for the node's screen rectangle.
 */
export function useHover(): HoverTarget | null {
  const view = useEditor();
  const subscribe = useMemo(
    () =>
      view
        ? (notify: () => void) => view.on("hover", () => notify())
        : undefined,
    [view],
  );
  const read = useMemo(
    () => (view ? () => view.hover.get() : undefined),
    [view],
  );
  return useExternalValue<HoverTarget | null>(subscribe, read, same, null);
}
