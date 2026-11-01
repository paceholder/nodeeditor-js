/**
 * Model binding (REN-04, MOD-10, MOD-02).
 *
 * Creates the view's own geometry scene over the model and turns committed changes into
 * dirty layers. The scene is a derived cache the view owns; the model stays the only
 * authority. Classification (design D8):
 *
 * - geometry, content and status changes all dirty the `scene` layer only; whether the
 *   geometry scene recomputes is its own decision (it refreshes just the cached record
 *   for label/status edits, so those never recompute geometry);
 * - a `reset` (whole-document replacement) and geometry registrations dirty `scene` too;
 * - theme and viewport changes never reach this module, so they cannot touch geometry.
 */
import {
  createGeometryScene,
  type GeometryRegistry,
  type GeometryScene,
  type SceneLayer,
  type SceneSource,
} from "../../core/index.js";
import type { LayerName } from "./frame-scheduler.js";

/** What a view needs from a model: reads plus committed-change events. */
export type ViewModel = SceneSource;

export interface ModelBinding {
  readonly scene: GeometryScene;
  /** Stop listening and release the scene. Safe to call twice. */
  dispose(): void;
}

export interface BindOptions {
  readonly geometry: GeometryRegistry;
  readonly zOrder: readonly SceneLayer[];
  readonly markDirty: (...layers: readonly LayerName[]) => void;
}

export function bindModel(
  model: ViewModel,
  options: BindOptions,
): ModelBinding {
  // The scene subscribes first, so it is current before any frame is painted.
  const scene = createGeometryScene(model, {
    registry: options.geometry,
    layerOrder: options.zOrder,
  });
  const dirty = (): void => options.markDirty("scene");
  const offs = [
    model.on("change", dirty),
    model.on("reset", dirty),
    options.geometry.onChange(dirty),
  ];
  let disposed = false;
  return {
    scene,
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const off of offs) off();
      scene.dispose();
    },
  };
}

/** IDs of the entities a committed patch removed; tools and choices cancel on them. */
export function removedIds(
  ops: ReadonlyArray<{ op: string; record?: { id: string } }>,
): string[] {
  return ops.flatMap((o) =>
    o.op === "remove" && o.record ? [o.record.id] : [],
  );
}
