/**
 * View-local selection.
 *
 * An ordered list of entity keys (`n:<id>` / `c:<id>`) plus a primary key. Insertion
 * order is the documented tie-break. Each view owns its own model; nothing here touches
 * the graph, and entities that disappear from the model are dropped when its events
 * arrive. The model also satisfies the scene painter's `ViewState` for selection.
 */
import type { ConnectionId, NodeId, SceneSource } from "../../../core/index.js";
import { connectionId, nodeId } from "../../../core/index.js";

export type SelectionKey = `n:${string}` | `c:${string}`;

export function nodeKey(id: NodeId): SelectionKey {
  return `n:${id}`;
}

export function connectionKey(id: ConnectionId): SelectionKey {
  return `c:${id}`;
}

export type SelectionChange =
  | {
      readonly mode: "replace" | "add" | "toggle";
      readonly keys: readonly SelectionKey[];
    }
  | { readonly mode: "clear" };

/** Pure application of a change to an ordered key list (no duplicates, stable order). */
export function applySelectionChange(
  keys: readonly SelectionKey[],
  change: SelectionChange,
): SelectionKey[] {
  switch (change.mode) {
    case "clear":
      return [];
    case "replace":
      return [...new Set(change.keys)];
    case "add":
      return [...new Set([...keys, ...change.keys])];
    case "toggle": {
      const flip = new Set(change.keys);
      const kept = keys.filter((k) => !flip.has(k));
      const added = [...flip].filter((k) => !keys.includes(k));
      return [...kept, ...added];
    }
  }
}

export interface SelectionEvent {
  readonly keys: readonly SelectionKey[];
  readonly primary: SelectionKey | undefined;
}

/** What tools may read. */
export interface ReadonlySelection {
  keys(): readonly SelectionKey[];
  has(key: SelectionKey): boolean;
  readonly size: number;
  primary(): SelectionKey | undefined;
  nodeIds(): NodeId[];
  connectionIds(): ConnectionId[];
}

export interface SelectionModel extends ReadonlySelection {
  /** Entity IDs are unique across kinds, so a bare ID is enough for painting. */
  isSelected(id: string): boolean;
  /** Apply a change; returns whether the selection differs afterwards. */
  apply(change: SelectionChange): boolean;
  replace(keys: readonly SelectionKey[]): boolean;
  add(keys: readonly SelectionKey[]): boolean;
  toggle(keys: readonly SelectionKey[]): boolean;
  clear(): boolean;
  on(handler: (event: SelectionEvent) => void): () => void;
  /**
   * Drop entities that left the model, on every committed change or reset. Returns the
   * unsubscribe function; `dispose()` also detaches.
   */
  bindToModel(model: SceneSource): () => void;
  dispose(): void;
}

export function createSelectionModel(): SelectionModel {
  let keys: SelectionKey[] = [];
  let ids = new Set<string>();
  let primary: SelectionKey | undefined;
  const handlers = new Set<(event: SelectionEvent) => void>();
  const unbinds = new Set<() => void>();

  function set(next: SelectionKey[], hint: readonly SelectionKey[]): boolean {
    const same =
      next.length === keys.length && next.every((k, i) => k === keys[i]);
    let nextPrimary = primary;
    const lastHint = [...hint].reverse().find((k) => next.includes(k));
    if (lastHint) nextPrimary = lastHint;
    if (!nextPrimary || !next.includes(nextPrimary)) nextPrimary = next.at(-1);
    if (same && nextPrimary === primary) return false;
    keys = next;
    ids = new Set(next.map((k) => k.slice(2)));
    primary = nextPrimary;
    const event: SelectionEvent = { keys, primary };
    for (const h of [...handlers]) h(event);
    return !same;
  }

  const model: SelectionModel = {
    keys: () => keys,
    has: (key) => keys.includes(key),
    get size() {
      return keys.length;
    },
    primary: () => primary,
    nodeIds: () =>
      keys.filter((k) => k.startsWith("n:")).map((k) => nodeId(k.slice(2))),
    connectionIds: () =>
      keys
        .filter((k) => k.startsWith("c:"))
        .map((k) => connectionId(k.slice(2))),
    isSelected: (id) => ids.has(id),
    apply(change) {
      const hint = change.mode === "clear" ? [] : change.keys;
      return set(applySelectionChange(keys, change), hint);
    },
    replace: (k) => model.apply({ mode: "replace", keys: k }),
    add: (k) => model.apply({ mode: "add", keys: k }),
    toggle: (k) => model.apply({ mode: "toggle", keys: k }),
    clear: () => model.apply({ mode: "clear" }),
    on(handler) {
      handlers.add(handler);
      return () => void handlers.delete(handler);
    },
    bindToModel(source) {
      const prune = (): void => {
        const live = keys.filter((k) =>
          k.startsWith("n:")
            ? source.reader.getNode(nodeId(k.slice(2)))
            : source.reader.getConnection(connectionId(k.slice(2))),
        );
        if (live.length !== keys.length) set(live, []);
      };
      const offs = [source.on("change", prune), source.on("reset", prune)];
      const off = (): void => {
        for (const o of offs) o();
        unbinds.delete(off);
      };
      unbinds.add(off);
      return off;
    },
    dispose() {
      for (const off of [...unbinds]) off();
      handlers.clear();
    },
  };
  return model;
}
