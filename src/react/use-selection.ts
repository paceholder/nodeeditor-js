/** Selection hook: the selected entities and the primary one, stable while unchanged. */
import { useMemo } from "react";
import {
  type ConnectionId,
  connectionId,
  type NodeId,
  nodeId,
} from "../core/index.js";
import type { SelectionKey } from "../view/index.js";
import { useEditor } from "./editor-context.js";
import { useExternalValue } from "./use-external-value.js";

/** The primary selected entity, with its kind. */
export type SelectedEntity =
  | { readonly kind: "node"; readonly id: NodeId }
  | { readonly kind: "connection"; readonly id: ConnectionId };

export interface SelectionSnapshot {
  readonly nodes: readonly NodeId[];
  readonly connections: readonly ConnectionId[];
  readonly primary: SelectedEntity | undefined;
}

const NONE: SelectionSnapshot = {
  nodes: [],
  connections: [],
  primary: undefined,
};

function decode(key: SelectionKey | undefined): SelectedEntity | undefined {
  if (!key) return undefined;
  return key.startsWith("n:")
    ? { kind: "node", id: nodeId(key.slice(2)) }
    : { kind: "connection", id: connectionId(key.slice(2)) };
}

const sameIds = (a: readonly string[], b: readonly string[]): boolean =>
  a.length === b.length && a.every((id, i) => id === b[i]);

const same = (a: SelectionSnapshot, b: SelectionSnapshot): boolean =>
  a.primary?.kind === b.primary?.kind &&
  a.primary?.id === b.primary?.id &&
  sameIds(a.nodes, b.nodes) &&
  sameIds(a.connections, b.connections);

export function useSelection(): SelectionSnapshot {
  const view = useEditor();
  const subscribe = useMemo(
    () =>
      view
        ? (notify: () => void) => view.selection.on(() => notify())
        : undefined,
    [view],
  );
  const read = useMemo(
    () =>
      view
        ? (): SelectionSnapshot => ({
            nodes: view.selection.nodeIds(),
            connections: view.selection.connectionIds(),
            primary: decode(view.selection.primary()),
          })
        : undefined,
    [view],
  );
  return useExternalValue(subscribe, read, same, NONE);
}
