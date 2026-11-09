/**
 * A small typed event emitter for the view handle (D1). Handlers run in
 * subscription order; one that throws does not stop the others, and its error is
 * reported asynchronously so the caller's input handling finishes first. `count` lets
 * the DOM side ask whether anyone listens (the context menu suppresses the browser's
 * menu only then).
 */
import { rethrowLater } from "../../platform/rethrow-later.js";

export interface ViewEvents<M> {
  /** Subscribe; returns the unsubscribe function. */
  on<K extends keyof M>(type: K, handler: (event: M[K]) => void): () => void;
  emit<K extends keyof M>(type: K, event: M[K]): void;
  count(type: keyof M): number;
  /** Drop every handler (dispose). */
  clear(): void;
}

export function createViewEvents<M>(
  report: (error: unknown) => void = rethrowLater,
): ViewEvents<M> {
  const handlers = new Map<keyof M, Array<(event: never) => void>>();
  return {
    on(type, handler) {
      const list = handlers.get(type) ?? [];
      handlers.set(type, list);
      // A wrapper per subscription, so subscribing one function twice unsubscribes once.
      const entry = (event: never) => handler(event);
      list.push(entry);
      return () => {
        const at = list.indexOf(entry);
        if (at >= 0) list.splice(at, 1);
      };
    },
    emit(type, event) {
      for (const h of [...(handlers.get(type) ?? [])]) {
        try {
          (h as (e: typeof event) => void)(event);
        } catch (error) {
          report(error);
        }
      }
    },
    count: (type) => handlers.get(type)?.length ?? 0,
    clear: () => handlers.clear(),
  };
}
