/**
 * The mounting component: one container, one view. The view is created
 * in an effect and disposed in its cleanup, so Strict Mode's setup, cleanup, setup leaves
 * one live view and one set of listeners.
 */
import {
  createElement,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from "react";
import { mountView } from "../view/index.js";
import { useEditorStore } from "./editor-context.js";
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
  const generation = useRemountGeneration(remountKeys(props));
  useEffect(() => {
    latest.current = props;
  });

  // biome-ignore lint/correctness/useExhaustiveDependencies: `generation` restarts the mount when a remount key changed
  useEffect(() => {
    const el = container.current;
    if (!el) return;
    const current = latest.current;
    const view = mountView(el, viewOptionsOf(current));
    const input = current.input === false ? undefined : current.input;
    applied.current = {
      theme: current.theme,
      toolOptions: input?.toolOptions,
      chooser: input?.chooseConnection,
    };
    store.set({ view, model: current.model });
    const offLock = view.on("lock", (e) =>
      latest.current.onLockedChange?.(e.locked),
    );
    return () => {
      offLock();
      store.set({ view: null, model: undefined });
      view.dispose();
    };
  }, [store, generation]);

  const { theme } = props;
  useEffect(() => {
    const view = store.get().view;
    if (!view || !theme || applied.current.theme === theme) return;
    applied.current.theme = theme;
    view.setTheme(theme);
  }, [store, theme]);

  const input = props.input === false ? undefined : props.input;
  const toolOptions = input?.toolOptions;
  useEffect(() => {
    const view = store.get().view;
    if (!view || !toolOptions || applied.current.toolOptions === toolOptions) {
      return;
    }
    applied.current.toolOptions = toolOptions;
    view.setToolOptions(toolOptions);
  }, [store, toolOptions]);

  const { locked } = props;
  useEffect(() => {
    const view = store.get().view;
    if (view && locked !== undefined && view.locked !== locked) {
      view.setLocked(locked);
    }
  }, [store, locked]);

  const chooser = input?.chooseConnection;
  useEffect(() => {
    const view = store.get().view;
    if (!view || applied.current.chooser === chooser) return;
    applied.current.chooser = chooser;
    view.setConnectionChooser(chooser);
  }, [store, chooser]);

  return createElement("div", {
    ref: container,
    className: props.className,
    style: {
      position: "relative",
      width: "100%",
      height: "100%",
      ...props.style,
    },
  });
}
