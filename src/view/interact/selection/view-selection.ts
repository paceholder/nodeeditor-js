/**
 * The selection as a host sees it: entities named by their kind and ID,
 * never by the view's internal keys. `createViewSelection` wraps a view's selection
 * model; tools keep using the model and its keys.
 */
import type { ConnectionId, NodeId } from "../../../core/index.js";
import { connectionId, nodeId } from "../../../core/index.js";
import {
  connectionKey,
  nodeKey,
  type SelectionKey,
  type SelectionModel,
} from "./selection-model.js";

/** One selected entity. */
export type SelectedEntity =
  | { readonly kind: "node"; readonly id: NodeId }
  | { readonly kind: "connection"; readonly id: ConnectionId };

/** The whole selection: what the `"selection"` event carries and `useSelection` returns. */
export interface SelectionState {
  readonly nodes: readonly NodeId[];
  readonly connections: readonly ConnectionId[];
  /** The entity most recently selected, or `undefined` for an empty selection. */
  readonly primary: SelectedEntity | undefined;
}

/** This view's selection. Entities that leave the model drop out of it. */
export interface ViewSelection {
  readonly size: number;
  /** The whole selection in one value; a new object per call. */
  state(): SelectionState;
  nodes(): NodeId[];
  connections(): ConnectionId[];
  primary(): SelectedEntity | undefined;
  has(entity: SelectedEntity): boolean;
  /** Entity IDs are unique across kinds, so a bare ID is enough for painting. */
  isSelected(id: string): boolean;
  /** Each returns whether the selection differs afterwards. */
  replace(entities: readonly SelectedEntity[]): boolean;
  add(entities: readonly SelectedEntity[]): boolean;
  toggle(entities: readonly SelectedEntity[]): boolean;
  clear(): boolean;
}

const keyOf = (e: SelectedEntity): SelectionKey =>
  e.kind === "node" ? nodeKey(e.id) : connectionKey(e.id);

function entityOf(key: SelectionKey | undefined): SelectedEntity | undefined {
  if (!key) return undefined;
  return key.startsWith("n:")
    ? { kind: "node", id: nodeId(key.slice(2)) }
    : { kind: "connection", id: connectionId(key.slice(2)) };
}

export function selectionStateOf(model: SelectionModel): SelectionState {
  return {
    nodes: model.nodeIds(),
    connections: model.connectionIds(),
    primary: entityOf(model.primary()),
  };
}

export function createViewSelection(model: SelectionModel): ViewSelection {
  return {
    get size() {
      return model.size;
    },
    state: () => selectionStateOf(model),
    nodes: model.nodeIds,
    connections: model.connectionIds,
    primary: () => entityOf(model.primary()),
    has: (entity) => model.has(keyOf(entity)),
    isSelected: model.isSelected,
    replace: (entities) => model.replace(entities.map(keyOf)),
    add: (entities) => model.add(entities.map(keyOf)),
    toggle: (entities) => model.toggle(entities.map(keyOf)),
    clear: model.clear,
  };
}
