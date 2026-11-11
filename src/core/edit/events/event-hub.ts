/**
 * Typed event hub with a FIFO dispatch queue.
 *
 * Events are delivered in the order they were emitted. While a dispatch runs, new events
 * and deferred jobs (edits submitted from inside a handler) are queued behind it, so no
 * handler observes a half-applied patch and every handler sees event 1 before event 2.
 * The events a deferred job emits go ahead of the jobs still waiting, so every handler
 * sees one queued edit's events before the next queued edit is applied.
 * A throwing handler is isolated: it becomes a `failure` event and the rest still run.
 * An error thrown by a `failure` handler goes to `onHandlerError` and is not re-dispatched.
 */
import type {
  ModelEventMap,
  ModelEventType,
  ResetEvent,
  Unsubscribe,
} from "./types.js";

type Handler<K extends ModelEventType> = (event: ModelEventMap[K]) => void;

export interface EventHub {
  on<K extends ModelEventType>(type: K, handler: Handler<K>): Unsubscribe;
  /** Queue an event; it is delivered now unless a dispatch is already running. */
  emit<K extends ModelEventType>(type: K, event: ModelEventMap[K]): void;
  /** Announce a whole-document replacement. Carries no patch. */
  emitReset(event: ResetEvent): void;
  /** Emit several events as one unit, so a nested dispatch cannot interleave. */
  dispatch(emitAll: () => void): void;
  isDispatching(): boolean;
  /**
   * Run `job` after everything already queued; resolves with its result. If `clear()`
   * drops the job first, resolves with `onDrop()` instead, so no caller waits forever.
   */
  defer<T>(job: () => T, onDrop: () => T): Promise<T>;
  /** Drop all handlers and queued work; dropped deferred jobs settle via `onDrop`. */
  clear(): void;
}

export interface EventHubOptions {
  /** Receives errors thrown by `failure` handlers. Defaults to an unhandled rejection. */
  readonly onHandlerError?: (error: unknown) => void;
}

const reportAsRejection = (error: unknown): void => {
  void Promise.reject(error);
};

export function createEventHub(options: EventHubOptions = {}): EventHub {
  const onHandlerError = options.onHandlerError ?? reportAsRejection;
  const handlers: { [K in ModelEventType]: Handler<K>[] } = {
    change: [],
    failure: [],
    history: [],
    reset: [],
    "resync-requested": [],
    conflict: [],
  };
  let queue: (() => void)[] = [];
  /** Events emitted by the deferred job now running; they jump the waiting jobs. */
  let jobEvents: (() => void)[] | undefined;
  let draining = false;
  const pendingDrops = new Set<() => void>();

  const listFor = <K extends ModelEventType>(type: K): Handler<K>[] =>
    handlers[type] as Handler<K>[];

  function deliver<K extends ModelEventType>(
    type: K,
    event: ModelEventMap[K],
  ): void {
    const list = listFor(type);
    for (const handler of [...list]) {
      if (!list.includes(handler)) continue;
      try {
        handler(event);
      } catch (error) {
        if (type === "failure") safeReport(error);
        else
          enqueue(() =>
            deliver("failure", { source: "handler", eventType: type, error }),
          );
      }
    }
  }

  function safeReport(error: unknown): void {
    try {
      onHandlerError(error);
    } catch {
      // Nothing sensible is left to do with an error in the error reporter.
    }
  }

  function enqueue(work: () => void): void {
    if (jobEvents) jobEvents.push(work);
    else queue.push(work);
  }

  function drain(): void {
    draining = true;
    try {
      for (let next = queue.shift(); next; next = queue.shift()) next();
    } finally {
      draining = false;
    }
  }

  function dispatch(emitAll: () => void): void {
    if (draining) {
      emitAll();
      return;
    }
    draining = true;
    try {
      emitAll();
    } finally {
      draining = false;
    }
    drain();
  }

  return {
    on(type, handler) {
      listFor(type).push(handler);
      return () => {
        const list = listFor(type);
        const at = list.indexOf(handler);
        if (at >= 0) list.splice(at, 1);
      };
    },
    emit(type, event) {
      dispatch(() => enqueue(() => deliver(type, event)));
    },
    emitReset(event) {
      dispatch(() => enqueue(() => deliver("reset", event)));
    },
    dispatch,
    isDispatching: () => draining,
    defer<T>(job: () => T, onDrop: () => T): Promise<T> {
      return new Promise<T>((resolve, reject) => {
        const drop = () => resolve(onDrop());
        pendingDrops.add(drop);
        const work = () => {
          pendingDrops.delete(drop);
          const own: (() => void)[] = [];
          jobEvents = own;
          try {
            resolve(job());
          } catch (error) {
            reject(error);
          } finally {
            jobEvents = undefined;
            queue.unshift(...own);
          }
        };
        if (draining) enqueue(work);
        else dispatch(() => enqueue(work));
      });
    },
    clear() {
      queue = [];
      jobEvents = undefined;
      const drops = [...pendingDrops];
      pendingDrops.clear();
      for (const drop of drops) drop();
      for (const type of Object.keys(handlers) as ModelEventType[])
        listFor(type).length = 0;
    },
  };
}
