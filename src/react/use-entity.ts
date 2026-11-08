/**
 * Entity-level hooks: a component that shows one node or connection
 * re-renders only when a committed change touched that entity.
 */
import { useMemo } from "react";
import type {
  ConnectionId,
  ConnectionRecord,
  NodeId,
  NodeRecord,
} from "../core/index.js";
import { useEditorSlot, useEditorStore } from "./editor-context.js";
import type { EntityKind } from "./entity-dispatcher.js";
import { useExternalValue } from "./use-external-value.js";

const same = <T>(a: T, b: T): boolean => Object.is(a, b);

function useEntity<T>(
  kind: EntityKind,
  id: string,
  read: (
    reader: NonNullable<ReturnType<typeof useEditorSlot>["model"]>["reader"],
  ) => T | undefined,
): T | undefined {
  const store = useEditorStore();
  const { model } = useEditorSlot();
  const subscribe = useMemo(() => {
    const dispatcher = model ? store?.entities() : undefined;
    return dispatcher
      ? (notify: () => void) => dispatcher.subscribe(kind, id, notify)
      : undefined;
  }, [store, model, kind, id]);
  const get = useMemo(
    () => (model ? () => read(model.reader) : undefined),
    [model, read],
  );
  return useExternalValue<T | undefined>(subscribe, get, same, undefined);
}

const readNode =
  (id: NodeId) => (r: { getNode(id: NodeId): NodeRecord | undefined }) =>
    r.getNode(id);
const readConnection =
  (id: ConnectionId) =>
  (r: { getConnection(id: ConnectionId): ConnectionRecord | undefined }) =>
    r.getConnection(id);

/** The node's record, or undefined while it is absent. Stable while the record is unchanged. */
export function useNode(id: NodeId): NodeRecord | undefined {
  const read = useMemo(() => readNode(id), [id]);
  return useEntity("node", id, read);
}

/** The connection's record, or undefined while it is absent. */
export function useConnection(id: ConnectionId): ConnectionRecord | undefined {
  const read = useMemo(() => readConnection(id), [id]);
  return useEntity("connection", id, read);
}
