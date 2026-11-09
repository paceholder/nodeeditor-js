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
import type { Viewport } from "../core/index.js";
import {
  type ConnectionChooser,
  mountView,
  type SelectedEntity,
  type SelectionState,
  type ZoomLimits,
} from "../view/index.js";
import { devWarn } from "./dev-warning.js";
import { provideStore, useEditorStore } from "./editor-context.js";
import { createEditorStore } from "./editor-store.js";
import {
  type NodeEditorProps,
  remountKeys,
  sameKeys,
  viewOptionsOf,
} from "./node-editor-props.js";
import { sameData } from "./same-data.js";
import { warnZoomLimitsIgnored, zoomLimitsUsable } from "./zoom-limits-prop.js";

interface CarriedState {
  /** The model the state belongs to; a different model starts fresh. */
  readonly model: unknown;
  readonly viewport?: Viewport;
  readonly selection?: readonly SelectedEntity[];
}

/** The selected entities with the primary one last, so `replace` makes it primary again. */
function selectedEntities(state: SelectionState): SelectedEntity[] {
  const all: SelectedEntity[] = [
    ...state.nodes.map((id) => ({ kind: "node" as const, id })),
    ...state.connections.map((id) => ({ kind: "connection" as const, id })),
  ];
  const { primary } = state;
  if (!primary) return all;
  return [
    ...all.filter((e) => e.kind !== primary.kind || e.id !== primary.id),
    primary,
  ];
}

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
  // The one function the view is given. It calls the latest `chooseConnection` prop, so a
  // new function from every render never reinstalls anything (installing a chooser cancels
  // a pending choice).
  const chooserTrampoline = useRef<ConnectionChooser>((request) => {
    const input = latest.current.input;
    return input === false || !input
      ? undefined
      : input.chooseConnection?.(request);
  });
  // The lock state of the last view, so an uncontrolled editor keeps it across a remount.
  const carriedLock = useRef<boolean | undefined>(undefined);
  // Viewport and selection of the last view, recorded at cleanup when they differ from
  // what that view started with. Used again only for the same model.
  const carried = useRef<CarriedState>({ model: undefined });
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
    const input = current.input === false ? undefined : current.input;
    const options = viewOptionsOf(current);
    if (carried.current.model !== current.model) {
      carried.current = { model: current.model };
    }
    const keep = carried.current;
    // A host that owns the selection (`viewState`) keeps it itself.
    const keepSelection = current.viewState ? undefined : keep.selection;
    const view = mountView(el, {
      ...options,
      ...(keep.viewport && { initialViewport: keep.viewport }),
      ...(options.input && input?.chooseConnection
        ? { input: { ...input, chooseConnection: chooserTrampoline.current } }
        : {}),
      ...(startLocked !== undefined && { locked: startLocked }),
    });
    applied.current = {
      theme: current.theme,
      toolOptions: input?.toolOptions,
      chooser: input?.chooseConnection !== undefined,
    };
    if (store.get().view) {
      devWarn(
        "A second NodeEditor mounted into a provider that already has an editor. " +
          "The hooks follow the newest one; give each editor its own EditorProvider.",
      );
    }
    store.set({ view, model: current.model });
    if (keepSelection) view.selection.replace(keepSelection);
    // What the view starts with, to tell later whether anything moved.
    const startViewport = view.viewport.get();
    const startSelection = selectedEntities(view.selection.state());
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
      // Remember what the user changed. A view torn down right after it mounted (Strict
      // Mode) changed nothing, so the next mount still fits the content.
      const viewport = view.viewport.get();
      const selection = selectedEntities(view.selection.state());
      carried.current = {
        model: carried.current.model,
        ...(carried.current.viewport && { viewport: carried.current.viewport }),
        ...(carried.current.selection && {
          selection: carried.current.selection,
        }),
        ...(!sameData(viewport, startViewport) && { viewport }),
        ...(!sameData(selection, startSelection) && { selection }),
      };
      // Another editor may have taken the slot since: only clear what is ours.
      if (store.get().view === view)
        store.set({ view: null, model: undefined });
      view.dispose();
    };
  }, [store, generation]);

  const { theme } = props;
  useEffect(() => {
    const view = store.get().view;
    if (!view || sameData(applied.current.theme, theme)) return;
    applied.current.theme = theme;
    // The prop describes the whole theme: dropping a key or the prop restores the default.
    view.setTheme(theme ?? {}, { replace: true });
  }, [store, theme]);

  const input = props.input === false ? undefined : props.input;
  const toolOptions = input?.toolOptions;
  useEffect(() => {
    const view = store.get().view;
    if (!view || sameData(applied.current.toolOptions, toolOptions)) return;
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
    const limits: ZoomLimits | undefined =
      zoomMin === undefined && zoomMax === undefined
        ? undefined
        : {
            ...(zoomMin !== undefined && { min: zoomMin }),
            ...(zoomMax !== undefined && { max: zoomMax }),
          };
    // An unusable value is ignored (the previous limits stay), not thrown from an effect.
    if (limits && !zoomLimitsUsable(limits))
      return warnZoomLimitsIgnored(limits);
    store.get().view?.setZoomLimits(limits);
  }, [store, zoomMin, zoomMax]);

  // Only whether a chooser is present matters here: the trampoline reaches the latest one.
  const hasChooser = input?.chooseConnection !== undefined;
  useEffect(() => {
    const view = store.get().view;
    if (!view || applied.current.chooser === hasChooser) return;
    applied.current.chooser = hasChooser;
    view.setConnectionChooser(
      hasChooser ? chooserTrampoline.current : undefined,
    );
  }, [store, hasChooser]);

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
