/**
 * Generic editor-state hook: read any value from the mounted view and
 * re-render when one of the named view events fires and the value differs. The built-in
 * selection, viewport, hover and lock hooks are written with it, so a host can follow
 * any value it can read from the view the same way, e.g. a count derived from the selection
 * plus the lock flag.
 */
import { useMemo } from "react";
import type { ViewEventMap, ViewHandle } from "../view/index.js";
import { useEditor } from "./editor-context.js";
import { useExternalValue } from "./use-external-value.js";

/**
 * The view events a state hook can follow. The context-menu event is left out on purpose:
 * while anyone listens to it the view suppresses the browser's own menu.
 */
export type StateEvent = Exclude<keyof ViewEventMap, "context-menu">;

export interface EditorStateOptions<T> {
  /** The value before an editor is mounted and during server rendering. */
  readonly fallback: T;
  /**
   * Equal values keep the previous object, so no re-render. Defaults to a shallow
   * comparison (`Object.is` on the value, or on each entry of an object or array), so a
   * `read` that builds a fresh object or array every call does not loop.
   */
  readonly isEqual?: (a: T, b: T) => boolean;
}

/** `Object.is`, or `Object.is` on every own entry of two plain objects or arrays. */
export function shallowEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (
    typeof a !== "object" ||
    typeof b !== "object" ||
    a === null ||
    b === null ||
    Array.isArray(a) !== Array.isArray(b)
  ) {
    return false;
  }
  const ka = Object.keys(a);
  if (ka.length !== Object.keys(b).length) return false;
  return ka.every(
    (k) =>
      Object.hasOwn(b, k) &&
      Object.is(
        (a as Record<string, unknown>)[k],
        (b as Record<string, unknown>)[k],
      ),
  );
}

/**
 * `read` and `events` may be written inline: the subscription depends on the event names,
 * and the snapshot keeps its identity while `isEqual` says nothing changed.
 */
export function useEditorState<T>(
  read: (view: ViewHandle) => T,
  events: readonly StateEvent[],
  options: EditorStateOptions<T>,
): T {
  const view = useEditor();
  const names = events.join("|");
  // biome-ignore lint/correctness/useExhaustiveDependencies: `names` stands for `events`, so an inline array does not resubscribe
  const subscribe = useMemo(
    () =>
      view
        ? (notify: () => void) => {
            const offs = events.map((type) => view.on(type, () => notify()));
            return () => {
              for (const off of offs) off();
            };
          }
        : undefined,
    [view, names],
  );
  const snapshot = useMemo(
    () => (view ? () => read(view) : undefined),
    [view, read],
  );
  return useExternalValue(
    subscribe,
    snapshot,
    options.isEqual ?? (shallowEqual as (a: T, b: T) => boolean),
    options.fallback,
  );
}
