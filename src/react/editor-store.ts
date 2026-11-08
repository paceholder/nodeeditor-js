/**
 * The mounted view as an observable value. The mount component writes it, hooks
 * read it, so an inspector outside the editor's subtree can follow the view that appears
 * and disappears. One store per provider; nothing is shared between providers.
 */
import type { ViewHandle, ViewModel } from "../view/index.js";
import {
  createEntityDispatcher,
  type EntityDispatcher,
} from "./entity-dispatcher.js";

export interface EditorSlot {
  readonly view: ViewHandle | null;
  readonly model: ViewModel | undefined;
}

export interface EditorStore {
  get(): EditorSlot;
  set(slot: EditorSlot): void;
  subscribe(listener: () => void): () => void;
  /** The dispatcher for the current model, shared by every entity hook; none without one. */
  entities(): EntityDispatcher | undefined;
}

const EMPTY: EditorSlot = { view: null, model: undefined };

export function createEditorStore(): EditorStore {
  let slot = EMPTY;
  const listeners = new Set<() => void>();
  // Created and disposed here, never while a component renders. It belongs to a model, not
  // to a view: a remount that keeps the model passes through an empty slot, and hooks
  // already subscribed must keep their dispatcher. It only listens to the model while a
  // hook is subscribed, so keeping it across the empty slot holds nothing open.
  let dispatcher: EntityDispatcher | undefined;
  let dispatcherModel: ViewModel | undefined;
  return {
    get: () => slot,
    entities: () => (slot.model ? dispatcher : undefined),
    set(next) {
      if (next.view === slot.view && next.model === slot.model) return;
      if (next.model && next.model !== dispatcherModel) {
        dispatcher?.dispose();
        dispatcher = createEntityDispatcher(next.model);
        dispatcherModel = next.model;
      }
      slot = next;
      for (const l of [...listeners]) l();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
  };
}

export const EMPTY_SLOT = EMPTY;
