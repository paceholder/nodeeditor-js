/** Provider and instance hook: how components outside the editor reach its view. */
import {
  createContext,
  createElement,
  type ReactNode,
  useContext,
  useState,
  useSyncExternalStore,
} from "react";
import type { ViewHandle } from "../view/index.js";
import {
  createEditorStore,
  type EditorSlot,
  type EditorStore,
  EMPTY_SLOT,
} from "./editor-store.js";

const EditorContext = createContext<EditorStore | null>(null);

/** Shares one editor with every component below it. Without one, hooks stay inert. */
export function EditorProvider(props: { children?: ReactNode }): ReactNode {
  const [store] = useState(createEditorStore);
  return createElement(
    EditorContext.Provider,
    { value: store },
    props.children,
  );
}

/** Makes `store` the nearest store for `children`; used by the mount component. */
export function provideStore(
  store: EditorStore,
  children: ReactNode,
): ReactNode {
  return createElement(EditorContext.Provider, { value: store }, children);
}

/** The nearest provider's store, or null outside any provider. */
export function useEditorStore(): EditorStore | null {
  return useContext(EditorContext);
}

const NO_SUBSCRIBE = (): (() => void) => () => {};

/** The current slot of the nearest provider; the inert empty slot without one. */
export function useEditorSlot(): EditorSlot {
  const store = useEditorStore();
  return useSyncExternalStore(
    store ? store.subscribe : NO_SUBSCRIBE,
    store ? store.get : () => EMPTY_SLOT,
    () => EMPTY_SLOT,
  );
}

/** The mounted view, or null before the editor mounts, after it unmounts, or outside a provider. */
export function useEditor(): ViewHandle | null {
  return useEditorSlot().view;
}
