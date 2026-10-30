/**
 * Test reference for `queryRect`: scan every entry and sort with the original
 * four-key comparator `(layer, z, seq, id)`. A path counts when its painted bounds and
 * at least one of its piece boxes intersect the area. Used by tests only.
 */

import type { GraphReader } from "../../data/model/reader.js";
import { rectsIntersect } from "../geometry/rect.js";
import type { Rect } from "../geometry/spaces.js";
import { compareKeys } from "../spatial-index/spatial-index.js";
import type { GeometryScene, SceneItem, SceneLayer } from "./geometry-scene.js";

const DEFAULT_LAYERS: readonly SceneLayer[] = ["connection", "node", "port"];

export function sceneReference(
  scene: GeometryScene,
  reader: GraphReader,
  area: Rect<"world">,
  bounds: "painted" | "hit" = "painted",
  layers: readonly SceneLayer[] = DEFAULT_LAYERS,
): SceneItem[] {
  const rank = (kind: SceneLayer): number => {
    const i = layers.indexOf(kind);
    return i < 0 ? layers.length : i;
  };
  const rows: { item: SceneItem; layer: number; z: number; seq: number }[] = [];
  for (const record of reader.nodes()) {
    const e = scene.node(record.id);
    const b = e && (bounds === "painted" ? e.paintedBounds : e.hitBounds);
    if (e && b && rectsIntersect(b, area))
      rows.push({
        item: { kind: "node", id: e.id },
        layer: rank("node"),
        z: e.record.z,
        seq: e.seq,
      });
  }
  for (const record of reader.connections()) {
    const e = scene.connection(record.id);
    if (
      e?.paintedBounds &&
      rectsIntersect(e.paintedBounds, area) &&
      e.segmentBounds.some((b) => rectsIntersect(b, area))
    )
      rows.push({
        item: { kind: "connection", id: e.id },
        layer: rank("connection"),
        z: 0,
        seq: e.seq,
      });
  }
  rows.sort(
    (a, b) =>
      a.layer - b.layer ||
      a.z - b.z ||
      a.seq - b.seq ||
      compareKeys(a.item.id, b.item.id),
  );
  return rows.map((r) => r.item);
}
