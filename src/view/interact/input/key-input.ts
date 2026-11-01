/**
 * Keyboard part of the DOM input adapter: `keydown`/`keyup` on the view
 * root go to the active tool first (Escape, Space-to-pan), then to the host keymap. No
 * shortcut runs in the middle of a gesture, so one gesture stays one history entry. Keys
 * from host content in the overlay (a menu button) never reach the graph.
 */
import type { RouteResult, ToolRouter } from "../tools/tool-router.js";
import type { CursorKind, Modifiers, ToolInput } from "../tools/tool-types.js";
import { isOverlayContent, shouldHandleKey } from "./input-scope.js";

export interface KeyInputDeps {
  readonly router: ToolRouter;
  readonly overlay: HTMLElement;
  readonly route: (input: ToolInput) => RouteResult;
  readonly modifiers: (event: KeyboardEvent) => Modifiers;
  readonly setCursor: (cursor: CursorKind) => void;
  /** The keymap: true when the key was bound, `"native"` when the browser acts. */
  readonly onKey: (event: KeyboardEvent) => boolean | "native";
}

export interface KeyInput {
  readonly onKeyDown: (event: KeyboardEvent) => void;
  readonly onKeyUp: (event: KeyboardEvent) => void;
}

export function createKeyInput(deps: KeyInputDeps): KeyInput {
  const { router, route } = deps;
  return {
    onKeyDown(e) {
      if (!shouldHandleKey(e) || isOverlayContent(e.target, deps.overlay)) {
        return;
      }
      const result = route({
        type: "key-down",
        key: e.key,
        modifiers: deps.modifiers(e),
      });
      if (result.handled) {
        e.preventDefault();
        return;
      }
      if (e.key === " ") {
        e.preventDefault();
        if (router.activePointer === undefined) deps.setCursor("grab");
        return;
      }
      // No shortcuts in the middle of a gesture: one gesture is one history entry.
      if (router.activePointer !== undefined) return;
      if (deps.onKey(e) === true) e.preventDefault();
    },
    onKeyUp(e) {
      route({ type: "key-up", key: e.key, modifiers: deps.modifiers(e) });
      if (e.key === " " && router.activePointer === undefined) {
        deps.setCursor("default");
      }
    },
  };
}
