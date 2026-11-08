/** Renders React elements into a real DOM node for browser tests, wrapped in `act`. */
import { act, createElement, type ReactNode, StrictMode } from "react";
import { createRoot } from "react-dom/client";

export interface Rendered {
  readonly container: HTMLElement;
  rerender(node: ReactNode): Promise<void>;
  unmount(): Promise<void>;
}

export async function renderReact(
  node: ReactNode,
  options: { readonly strict?: boolean; readonly size?: [number, number] } = {},
): Promise<Rendered> {
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  const [w, h] = options.size ?? [500, 300];
  const container = document.createElement("div");
  container.style.cssText = `width:${w}px;height:${h}px;position:relative;`;
  container.dataset.reactHarness = "";
  document.body.append(container);
  const root = createRoot(container);
  const wrap = (n: ReactNode): ReactNode =>
    options.strict ? createElement(StrictMode, null, n) : n;
  let mounted = true;
  await act(async () => root.render(wrap(node)));
  return {
    container,
    async rerender(next) {
      await act(async () => root.render(wrap(next)));
    },
    async unmount() {
      if (!mounted) return;
      mounted = false;
      await act(async () => root.unmount());
      container.remove();
    },
  };
}
