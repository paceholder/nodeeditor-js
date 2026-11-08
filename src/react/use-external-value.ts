/**
 * Hook plumbing shared by the editor hooks: a `useSyncExternalStore`
 * whose snapshot stays the same object while the value is unchanged, so a component
 * re-renders only when something it shows changed. Callers memoize `subscribe` and `read`
 * on the view or model they come from.
 */
import { useCallback, useRef, useSyncExternalStore } from "react";

const NO_SUBSCRIBE = (): (() => void) => () => {};

export function useExternalValue<T>(
  subscribe: ((notify: () => void) => () => void) | undefined,
  read: (() => T) | undefined,
  same: (a: T, b: T) => boolean,
  inert: T,
): T {
  const cached = useRef(inert);
  const getSnapshot = useCallback((): T => {
    const next = read ? read() : inert;
    if (!same(cached.current, next)) cached.current = next;
    return cached.current;
  }, [read, same, inert]);
  const serverSnapshot = useCallback((): T => inert, [inert]);
  return useSyncExternalStore(
    subscribe ?? NO_SUBSCRIBE,
    getSnapshot,
    serverSnapshot,
  );
}
