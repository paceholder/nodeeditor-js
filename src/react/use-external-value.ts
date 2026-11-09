/**
 * Hook plumbing shared by the editor hooks: a `useSyncExternalStore`
 * whose snapshot stays the same object while the value is unchanged, so a component
 * re-renders only when something it shows changed. Callers memoize `subscribe` and `read`
 * on the view or model they come from.
 *
 * `read` runs again only after the subscription reported a change (or when `read` itself
 * is a different function), never merely because React asked for the snapshot again. A
 * `read` that builds a fresh nested value on each call therefore cannot loop: React gets
 * the same object back until something really changed.
 */
import { useCallback, useRef, useSyncExternalStore } from "react";

const NO_SUBSCRIBE = (): (() => void) => () => {};

interface Cached<T> {
  readonly read: (() => T) | undefined;
  readonly inert: T;
  readonly version: number;
  readonly value: T;
}

export function useExternalValue<T>(
  subscribe: ((notify: () => void) => () => void) | undefined,
  read: (() => T) | undefined,
  same: (a: T, b: T) => boolean,
  inert: T,
): T {
  // Bumped by every notification and every (re)subscription, so a change that happened
  // between render and subscribe is read once.
  const version = useRef(0);
  const cached = useRef<Cached<T> | null>(null);
  const subscribeCounting = useCallback(
    (notify: () => void) => {
      version.current += 1;
      return (subscribe ?? NO_SUBSCRIBE)(() => {
        version.current += 1;
        notify();
      });
    },
    [subscribe],
  );
  const getSnapshot = useCallback((): T => {
    const prev = cached.current;
    if (
      prev &&
      prev.read === read &&
      prev.inert === inert &&
      prev.version === version.current
    ) {
      return prev.value;
    }
    const next = read ? read() : inert;
    const value = prev && same(prev.value, next) ? prev.value : next;
    cached.current = { read, inert, version: version.current, value };
    return value;
  }, [read, same, inert]);
  const serverSnapshot = useCallback((): T => inert, [inert]);
  return useSyncExternalStore(subscribeCounting, getSnapshot, serverSnapshot);
}
