/**
 * DOM wiring of the pending connection choice (D4): the controller plus the
 * root listeners that end it. Escape cancels, from the editor or the host's picker in
 * the overlay; a press outside overlay content cancels and is consumed, so it starts no
 * gesture. While a choice is pending, other keys aimed at the editor run nothing, the
 * same rule as during a drag. Both listeners run in the capture phase, before the DOM
 * input adapter, the keymap and the context-menu input on the same root.
 */
import { type Command, type Point, worldToViewport } from "../core/index.js";
import type { ConnectionChooser } from "./interact/choice/choice-types.js";
import {
  type ConnectionChoice,
  createConnectionChoice,
} from "./interact/choice/connection-choice.js";
import { isOverlayContent } from "./interact/input/input-scope.js";
import type { ChoiceRelease } from "./interact/tools/tool-types.js";
import { removedIds, type ViewModel } from "./platform/model-binding.js";
import type { ViewportState } from "./platform/viewport-state.js";

export interface ViewConnectionChoiceDeps {
  /** Removal of an involved node or port, or a reset, cancels a pending choice. */
  readonly model: ViewModel;
  readonly overlay: HTMLElement;
  readonly viewport: Pick<ViewportState, "get">;
  readonly commit: (command: Command) => void;
  readonly clearPreview: () => void;
  readonly chooser: ConnectionChooser | undefined;
}

export interface ViewConnectionChoice
  extends Pick<ConnectionChoice, "installed" | "setChooser" | "cancel"> {
  /** The effect host's `choose`: a release on a choice target. */
  open(release: ChoiceRelease): void;
  dispose(): void;
}

export function attachViewConnectionChoice(
  root: HTMLElement,
  deps: ViewConnectionChoiceDeps,
): ViewConnectionChoice {
  const choice = createConnectionChoice(
    {
      commit: deps.commit,
      clearPreview: deps.clearPreview,
      place(world: Point<"world">) {
        const viewport = worldToViewport(deps.viewport.get(), world);
        const r = root.getBoundingClientRect();
        return {
          client: { x: r.left + viewport.x, y: r.top + viewport.y },
          viewport,
        };
      },
    },
    deps.chooser,
  );

  const onKeyDown = (e: KeyboardEvent): void => {
    if (!choice.pending()) return;
    if (e.key === "Escape") choice.cancel();
    // Keys inside the host's picker are the picker's (it closes on the aborted signal).
    else if (isOverlayContent(e.target, deps.overlay)) return;
    e.preventDefault();
    e.stopImmediatePropagation();
  };
  const onPointerDown = (e: PointerEvent): void => {
    if (!choice.pending() || isOverlayContent(e.target, deps.overlay)) return;
    choice.cancel();
    e.preventDefault();
    e.stopImmediatePropagation();
  };
  root.addEventListener("keydown", onKeyDown, true);
  root.addEventListener("pointerdown", onPointerDown, true);
  const offs = [
    deps.model.on("change", (e) =>
      choice.entitiesRemoved(removedIds(e.patch.ops)),
    ),
    deps.model.on("reset", () => choice.cancel()),
  ];

  return {
    open: choice.open,
    installed: choice.installed,
    setChooser: choice.setChooser,
    cancel: choice.cancel,
    dispose() {
      root.removeEventListener("keydown", onKeyDown, true);
      root.removeEventListener("pointerdown", onPointerDown, true);
      for (const off of offs) off();
      choice.dispose();
    },
  };
}
