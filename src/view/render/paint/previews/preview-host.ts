/**
 * Preview host: stores the active tool preview, paints it on the interaction layer, and
 * keeps the scene layer's hidden set in step (D6, D8). Setting a preview repaints the
 * interaction layer; the scene repaints only when the hidden set changes (drag start and
 * end), never per pointer move. Previews are never serialized and never
 * reach the model.
 */
import type {
  GeometryScene,
  GraphReader,
  RouteRegistry,
} from "../../../../core/index.js";
import type { InteractionLayer } from "../interaction-layer.js";
import type { SceneLayerDeps } from "../scene-layer.js";
import { paintConnectPreview } from "./connect-preview-painter.js";
import { previewedEntityIds } from "./ghost-entries.js";
import { paintMarquee } from "./marquee-painter.js";
import { paintMovePreview } from "./move-preview-painter.js";
import type { ToolPreview } from "./preview-types.js";
import { paintResizePreview } from "./resize-preview-painter.js";
import { paintRoutePreview } from "./route-preview-painter.js";

/** Mutable set of entity IDs the scene layer skips; read through `isHidden`. */
export interface HiddenIds {
  readonly isHidden: (id: string) => boolean;
  /** Replace the set; returns whether it changed. */
  set(ids: ReadonlySet<string>): boolean;
}

export function createHiddenIds(): HiddenIds {
  let ids: ReadonlySet<string> = new Set();
  return {
    isHidden: (id) => ids.has(id),
    set(next) {
      const same = next.size === ids.size && [...next].every((i) => ids.has(i));
      if (same) return false;
      ids = new Set(next);
      return true;
    },
  };
}

export interface PreviewHostEnv {
  readonly interaction: Pick<InteractionLayer, "add" | "invalidate">;
  readonly hidden: HiddenIds;
  readonly invalidateScene: () => void;
  /** Present once the view is bound to a model; absent otherwise (previews then no-op). */
  readonly bound: () =>
    | (Omit<SceneLayerDeps, "reader" | "scene"> & {
        reader: GraphReader;
        scene: GeometryScene;
        routes: RouteRegistry;
      })
    | undefined;
}

export interface PreviewHost {
  set(preview: ToolPreview | null): void;
  current(): ToolPreview | null;
  dispose(): void;
}

/** Entities a preview draws itself, which the scene layer skips (D6, D8). */
function hiddenBy(
  reader: GraphReader,
  preview: ToolPreview | null,
): Set<string> {
  switch (preview?.kind) {
    case "move": {
      const ids = previewedEntityIds(reader, preview.moving);
      // The preview draws these frames as they will be after the drop.
      for (const frame of preview.groups ?? []) ids.add(frame.group);
      return ids;
    }
    case "resize":
      return previewedEntityIds(reader, [preview.node]);
    case "route":
      return new Set([preview.connection]);
    default:
      return new Set();
  }
}

export function createPreviewHost(env: PreviewHostEnv): PreviewHost {
  let current: ToolPreview | null = null;
  const remove = env.interaction.add({
    // Below presence (100): remote cursors stay readable over a local gesture.
    order: 10,
    paint(ctx, frame) {
      if (!current) return;
      if (current.kind === "marquee") {
        paintMarquee(ctx, frame, current);
        return;
      }
      const bound = env.bound();
      if (!bound) return;
      switch (current.kind) {
        case "connect":
          paintConnectPreview(
            ctx,
            bound.scene,
            bound.routes.defaultRouter,
            frame,
            current,
          );
          return;
        case "move":
          paintMovePreview(ctx, bound, frame, current);
          return;
        case "resize":
          paintResizePreview(ctx, bound, frame, current);
          return;
        case "route":
          paintRoutePreview(ctx, bound, frame, current);
          return;
      }
    },
  });
  return {
    set(preview) {
      current = preview;
      const bound = env.bound();
      const ids = bound ? hiddenBy(bound.reader, preview) : new Set<string>();
      if (env.hidden.set(ids)) env.invalidateScene();
      env.interaction.invalidate();
    },
    current: () => current,
    dispose() {
      remove();
      current = null;
    },
  };
}
