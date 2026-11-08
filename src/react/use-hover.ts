/** Hover hook: the entity under the pointer; re-renders only when it changes. */
import type { HoverTarget } from "../view/index.js";
import { useEditorState } from "./use-editor-state.js";

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

const EVENTS = ["hover"] as const;
const OPTIONS = { fallback: null, isEqual: same };

/**
 * The hovered node, port or connection, or null. A host that wants a delay before showing
 * a tooltip keeps it on its side; use `view.on("hover")` for the node's screen rectangle.
 */
export function useHover(): HoverTarget | null {
  return useEditorState<HoverTarget | null>(
    (view) => view.hover.get(),
    EVENTS,
    OPTIONS,
  );
}
