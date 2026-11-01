/**
 * The view's context-menu hook (D1, D8): `view.on("context-menu", handler)` plus
 * the DOM triggers, which attach only when the view has editing input. Subscribing works
 * either way; without input the event simply never fires.
 */

import {
  attachContextMenuInput,
  type ContextMenuInput,
  type ContextMenuInputDeps,
} from "./interact/context-menu/context-menu-input.js";
import type { ViewEventMap } from "./interact/context-menu/context-menu-types.js";
import {
  createViewEvents,
  type ViewEvents,
} from "./interact/input/view-events.js";

export interface ViewContextMenu {
  readonly on: ViewEvents<ViewEventMap>["on"];
  /** Start listening on the root; called once the DOM input exists. */
  attach(deps: Omit<ContextMenuInputDeps, "listening" | "emit">): void;
  dispose(): void;
}

export function createViewContextMenu(root: HTMLElement): ViewContextMenu {
  const events = createViewEvents<ViewEventMap>();
  let input: ContextMenuInput | undefined;
  return {
    on: events.on,
    attach(deps) {
      input?.dispose();
      input = attachContextMenuInput(root, {
        ...deps,
        listening: () => events.count("context-menu") > 0,
        emit: (event) => events.emit("context-menu", event),
      });
    },
    dispose() {
      input?.dispose();
      input = undefined;
      events.clear();
    },
  };
}
