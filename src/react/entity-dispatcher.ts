/**
 * One subscription to a model's committed changes, fanned out by entity ID.
 * A node inspector registers under its node's ID and is called only when a patch touched
 * that node, so dragging another node never wakes it. A `reset` replaces the whole
 * document and wakes everyone. The model is listened to only while a hook is registered.
 */
import type { ConnectionId, NodeId } from "../core/index.js";
import type { ViewModel } from "../view/index.js";

export type EntityKind = "node" | "connection";

export interface EntityDispatcher {
  subscribe(kind: EntityKind, id: string, listener: () => void): () => void;
  dispose(): void;
}

export function createEntityDispatcher(model: ViewModel): EntityDispatcher {
  const byKind: Record<EntityKind, Map<string, Set<() => void>>> = {
    node: new Map(),
    connection: new Map(),
  };
  let count = 0;
  let offs: Array<() => void> = [];

  const wake = (kind: EntityKind, ids: readonly (NodeId | ConnectionId)[]) => {
    for (const id of ids) {
      for (const l of [...(byKind[kind].get(id) ?? [])]) l();
    }
  };
  const wakeAll = (): void => {
    for (const kind of ["node", "connection"] as const) {
      for (const set of [...byKind[kind].values()]) {
        for (const l of [...set]) l();
      }
    }
  };
  const attach = (): void => {
    offs = [
      model.on("change", (e) => {
        wake("node", e.changed.nodes);
        wake("connection", e.changed.connections);
      }),
      model.on("reset", wakeAll),
    ];
  };
  const detach = (): void => {
    for (const off of offs) off();
    offs = [];
  };

  return {
    subscribe(kind, id, listener) {
      const map = byKind[kind];
      const set = map.get(id) ?? new Set<() => void>();
      map.set(id, set);
      set.add(listener);
      if (++count === 1) attach();
      let live = true;
      return () => {
        if (!live) return;
        live = false;
        set.delete(listener);
        if (set.size === 0 && map.get(id) === set) map.delete(id);
        if (--count === 0) detach();
      };
    },
    dispose() {
      for (const map of Object.values(byKind)) map.clear();
      count = 0;
      detach();
    },
  };
}
