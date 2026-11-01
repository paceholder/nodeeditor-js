/**
 * Resize handle wiring for a mounted view (D8): adds the handle painter to the
 * interaction layer over the view's selection, capability probe and active preview,
 * repaints that layer when the selection or the model changes, and answers the hover
 * cursor over the handle. The painter and the resize tool share `resize-handle.ts`, so
 * the cursor, the drawing and the press all agree.
 */
import type {
  Availability,
  CapabilityAction,
  GeometryScene,
  NodeId,
  Point,
} from "../../../core/index.js";
import type { ViewModel } from "../../platform/model-binding.js";
import type { InteractionLayer } from "../../render/paint/interaction-layer.js";
import {
  hitsResizeHandle,
  resizeHandleOf,
} from "../../render/paint/previews/resize-handle.js";
import {
  createResizeHandlePainter,
  type ResizeHandleSource,
  resizeHandleEntry,
} from "../../render/paint/previews/resize-handle-painter.js";
import type { SelectionModel } from "../selection/selection-model.js";
import { resizeTargetOf } from "./resize-tool.js";
import type { CursorKind, ToolPreview } from "./tool-types.js";

export interface ResizeHandlesDeps {
  readonly model: Pick<ViewModel, "on">;
  readonly scene: Pick<GeometryScene, "node" | "project">;
  readonly selection: Pick<SelectionModel, "on" | "size" | "nodeIds">;
  readonly can: (action: CapabilityAction, id: NodeId) => Availability;
  readonly zoom: () => number;
  readonly preview: () => ToolPreview | null;
  readonly interaction: Pick<InteractionLayer, "add" | "invalidate">;
}

export interface ResizeHandles {
  /** Whether a handle is drawn now (it is in world space, so it follows the viewport). */
  visible(): boolean;
  /** `nwse-resize` over the handle, else undefined. */
  cursorAt(world: Point<"world">): CursorKind | undefined;
  dispose(): void;
}

export function createResizeHandles(deps: ResizeHandlesDeps): ResizeHandles {
  const source: ResizeHandleSource = {
    scene: deps.scene,
    target: () => resizeTargetOf(deps.selection),
    resizable: (id) => deps.can("resize", id).available,
    preview: deps.preview,
  };
  const offs = [
    deps.interaction.add(createResizeHandlePainter(source)),
    deps.selection.on(() => deps.interaction.invalidate()),
    // The handle's node, its size or its capability may have changed.
    deps.model.on("change", () => {
      if (source.target()) deps.interaction.invalidate();
    }),
    deps.model.on("reset", () => deps.interaction.invalidate()),
  ];
  return {
    visible: () => resizeHandleEntry(source) !== undefined,
    cursorAt(world) {
      const entry = resizeHandleEntry(source);
      if (!entry) return undefined;
      const handle = resizeHandleOf(entry, deps.zoom());
      return hitsResizeHandle(handle, world) ? "nwse-resize" : undefined;
    },
    dispose() {
      for (const off of offs.splice(0)) off();
    },
  };
}
