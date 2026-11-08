/**
 * The mounted view as an observable value. The mount component writes it, hooks
 * read it, so an inspector outside the editor's subtree can follow the view that appears
 * and disappears. One store per provider; nothing is shared between providers.
 */
import type { ViewHandle, ViewModel } from "../view/index.js";

export interface EditorSlot {
  readonly view: ViewHandle | null;
  readonly model: ViewModel | undefined;
}

export interface EditorStore {
  get(): EditorSlot;
  set(slot: EditorSlot): void;
  subscribe(listener: () => void): () => void;
}

const EMPTY: EditorSlot = { view: null, model: undefined };

export function createEditorStore(): EditorStore {
  let slot = EMPTY;
  const listeners = new Set<() => void>();
  return {
    get: () => slot,
    set(next) {
      if (next.view === slot.view && next.model === slot.model) return;
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
