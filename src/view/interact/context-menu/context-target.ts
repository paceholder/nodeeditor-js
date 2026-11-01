/**
 * Context-menu target and selection rule (D3, D6). Pure functions over
 * the ordered hits, the selection and the scene, so they run in Node tests.
 */
import {
  connectionId,
  type GeometryScene,
  type HitCandidate,
  nodeId,
  type Point,
  type Rect,
  rectCenter,
} from "../../../core/index.js";
import {
  connectionKey,
  nodeKey,
  type ReadonlySelection,
  type SelectionChange,
  type SelectionKey,
} from "../selection/selection-model.js";
import type { ContextMenuTarget } from "./context-menu-types.js";

/** The topmost hit as a target, the same pick a click uses; canvas when nothing is hit. */
export function contextTarget(
  hits: readonly HitCandidate[],
): ContextMenuTarget {
  const top = hits[0];
  if (!top) return { kind: "canvas" };
  switch (top.kind) {
    case "node":
      return { kind: "node", node: top.nodeId };
    case "port":
      return { kind: "port", node: top.nodeId, port: top.portId };
    case "connection":
      return top.member === undefined
        ? { kind: "connection", connection: top.connectionId }
        : {
            kind: "connection",
            connection: top.connectionId,
            member: top.member,
          };
  }
}

function keyOf(target: ContextMenuTarget): SelectionKey | undefined {
  switch (target.kind) {
    case "node":
    case "port":
      return nodeKey(target.node);
    case "connection":
      return connectionKey(target.connection);
    case "canvas":
      return undefined;
  }
}

/**
 * Select-on-open for pointer and touch invocations (D3): an unselected entity (a port's
 * node for a port) becomes the only selection; a selected entity or the canvas leaves
 * the selection alone. Modifiers do not change the rule.
 */
export function selectOnOpen(
  target: ContextMenuTarget,
  selection: ReadonlySelection,
): SelectionChange | undefined {
  const key = keyOf(target);
  if (key === undefined || selection.has(key)) return undefined;
  return { mode: "replace", keys: [key] };
}

/**
 * Keyboard invocation (D6): the primary selected node or connection, else the canvas,
 * placed at the centre of the entity's bounds clamped into the visible world rectangle,
 * or at the view centre.
 */
export function keyboardTarget(
  selection: ReadonlySelection,
  scene: GeometryScene,
  visible: Rect<"world">,
): { readonly target: ContextMenuTarget; readonly world: Point<"world"> } {
  const primary = selection.primary();
  const id = primary?.slice(2) ?? "";
  let target: ContextMenuTarget = { kind: "canvas" };
  let bounds: Rect<"world"> | undefined;
  if (primary?.startsWith("n:")) {
    const entry = scene.node(nodeId(id));
    if (entry) {
      target = { kind: "node", node: entry.id };
      bounds = entry.bodyBounds;
    }
  } else if (primary?.startsWith("c:")) {
    const entry = scene.connection(connectionId(id));
    if (entry) {
      target = { kind: "connection", connection: entry.id };
      bounds = entry.paintedBounds;
    }
  }
  const at = rectCenter(bounds ?? visible);
  return { target, world: clampInto(at, visible) };
}

function clampInto(p: Point<"world">, r: Rect<"world">): Point<"world"> {
  return {
    x: Math.min(Math.max(p.x, r.x), r.x + r.w),
    y: Math.min(Math.max(p.y, r.y), r.y + r.h),
  };
}
