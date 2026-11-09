/**
 * What a committed model change means to a running gesture: the IDs it removed,
 * the IDs it touched, and where it came from. Shared by the mounted view and the tool
 * harness, so both feed the router the same way.
 */
import type { ChangeEvent } from "../../../core/index.js";
import { removedIds } from "../../platform/model-binding.js";
import type { GestureChange } from "./tool-router.js";

export function gestureChangeOf(event: ChangeEvent): GestureChange {
  const { nodes, ports, connections } = event.changed;
  return {
    removed: removedIds(event.patch.ops),
    changed: [...nodes, ...ports, ...connections],
    origin: event.origin,
  };
}
