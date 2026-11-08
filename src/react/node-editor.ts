/**
 * The mounting component: one container, one view. The view is created
 * in an effect and disposed in its cleanup, so Strict Mode's setup, cleanup, setup leaves
 * one live view and one set of listeners.
 */
import {
  createElement,
  Fragment,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from "react";
import { mountView } from "../view/index.js";
import { devWarn } from "./dev-warning.js";
import { provideStore, useEditorStore } from "./editor-context.js";
import { createEditorStore } from "./editor-store.js";
import {
  type NodeEditorProps,
  remountKeys,
  sameKeys,
  viewOptionsOf,
} from "./node-editor-props.js";

/** Counts how many times the remount keys changed; the effect restarts on each. */
function useRemountGeneration(keys: readonly unknown[]): number {
  const [state, setState] = useState({ keys, generation: 0 });
  if (!sameKeys(state.keys, keys)) {
    setState({ keys, generation: state.generation + 1 });
  }
  return state.generation;
}

const STORM_RENDERS = 3;

/**
 * Warns in development when the view remounts on several renders in a row: a remount
 * option rebuilt on every render (an inline registry, say) throws the view away each time.
 */
function useRemountStormWarning(generation: number): void {
  const last = useRef(generation);
  const streak = useRef(0);
  const warned = useRef(false);
  useEffect(() => {
    streak.current = generation === last.current ? 0 : streak.current + 1;
    last.current = generation;
    if (streak.current >= STORM_RENDERS && !warned.current) {
      warned.current = true;
      devWarn(
        "NodeEditor remounted its view on several renders in a row. An option that " +
          "cannot change on a live view (model, geometry, routes, painters, ...) is " +
          "probably created anew on every render; create it once or memoize it.",
      );
    }
  });
}

export function NodeEditor(props: NodeEditorProps): ReactNode {
  const shared = useEditorStore();
  const [own] = useState(createEditorStore);
  const store = shared ?? own;
  const container = useRef<HTMLDivElement>(null);
  const latest = useRef(props);
  const applied = useRef({
    theme: props.theme,
    toolOptions: undefined as unknown,
    chooser: undefined as unknown,
  });
  // The lock state of the last view, so an uncontrolled editor keeps it across a remount.
  const carriedLock = useRef<boolean | undefined>(undefined);
  const generation = useRemountGeneration(remountKeys(props));
  useRemountStormWarning(generation);
  useEffect(() => {
    latest.current = props;
  });

  // biome-ignore lint/correctness/useExhaustiveDependencies: `generation` restarts the mount when a remount key changed
  useEffect(() => {
    const el = container.current;
    if (!el) return;
    const current = latest.current;
    const startLocked = current.locked ?? carriedLock.current;
    const view = mountView(el, {
      ...viewOptionsOf(current),
      ...(startLocked !== undefined && { locked: startLocked }),
    });
    const input = current.input === false ? undefined : current.input;
    applied.current = {
      theme: current.theme,
      toolOptions: input?.toolOptions,
      chooser: input?.chooseConnection,
    };
    if (store.get().view) {
      devWarn(
        "A second NodeEditor mounted into a provider that already has an editor. " +
          "The hooks follow the newest one; give each editor its own EditorProvider.",
      );
    }
    store.set({ view, model: current.model });
    current.onReady?.(view);
    const offLock = view.on("lock", (e) => {
      const { locked, onLockedChange } = latest.current;
      if (locked === undefined) {
        // Uncontrolled: the view owns the flag and the host is told about every change.
        carriedLock.current = e.locked;
        onLockedChange?.(e.locked);
        return;
      }
      // Controlled: the prop is the truth. A change that matches it is the prop's own.
      if (e.locked === locked) return;
      // Anything else is an attempt (the lock button, a `setLocked` call): tell the host
      // and hold the view at the prop until the host passes a new value.
      onLockedChange?.(e.locked);
      view.setLocked(locked);
    });
    return () => {
      offLock();
      // Another editor may have taken the slot since: only clear what is ours.
      if (store.get().view === view)
        store.set({ view: null, model: undefined });
      view.dispose();
    };
  }, [store, generation]);

  const { theme } = props;
  useEffect(() => {
    const view = store.get().view;
    if (!view || applied.current.theme === theme) return;
    applied.current.theme = theme;
    // The prop describes the whole theme: dropping a key or the prop restores the default.
    view.setTheme(theme ?? {}, { replace: true });
  }, [store, theme]);

  const input = props.input === false ? undefined : props.input;
  const toolOptions = input?.toolOptions;
  useEffect(() => {
    const view = store.get().view;
    if (!view || applied.current.toolOptions === toolOptions) return;
    applied.current.toolOptions = toolOptions;
    view.setToolOptions(toolOptions ?? {}, { replace: true });
  }, [store, toolOptions]);

  const { locked } = props;
  useEffect(() => {
    const view = store.get().view;
    if (view && locked !== undefined && view.locked !== locked) {
      view.setLocked(locked);
    }
  }, [store, locked]);

  // Compared by value, so an inline `{ min, max }` object costs nothing.
  const zoomMin = props.zoomLimits?.min;
  const zoomMax = props.zoomLimits?.max;
  useEffect(() => {
    store.get().view?.setZoomLimits(
      zoomMin === undefined && zoomMax === undefined
        ? undefined
        : {
            ...(zoomMin !== undefined && { min: zoomMin }),
            ...(zoomMax !== undefined && { max: zoomMax }),
          },
    );
  }, [store, zoomMin, zoomMax]);

  const chooser = input?.chooseConnection;
  useEffect(() => {
    const view = store.get().view;
    if (!view || applied.current.chooser === chooser) return;
    applied.current.chooser = chooser;
    view.setConnectionChooser(chooser);
  }, [store, chooser]);

  return provideStore(
    store,
    createElement(
      Fragment,
      null,
      createElement("div", {
        ref: container,
        className: props.className,
        style: {
          position: "relative",
          width: "100%",
          height: "100%",
          ...props.style,
        },
      }),
      props.children,
    ),
  );
}
