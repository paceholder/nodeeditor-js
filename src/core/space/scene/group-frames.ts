/**
 * Group frames of the geometry scene.
 *
 * One entry per group, derived from the body bounds of its member nodes. Groups are few
 * compared with nodes, so they are kept in a plain map and scanned in document order
 * instead of going into the spatial index.
 */
import type { GroupId, NodeId } from "../../base/ids/ids.js";
import type { GraphReader } from "../../data/model/reader.js";
import type { GroupRecord } from "../../data/model/records.js";
import {
  type GroupFrameMetrics,
  type GroupFramePart,
  groupFrame,
  groupFramePartAt,
  groupTitleStrip,
} from "../geometry/group-frame.js";
import { rectsIntersect } from "../geometry/rect.js";
import type { Point, Rect } from "../geometry/spaces.js";
import type { NodeEntry } from "./scene-entries.js";

type W = "world";

export interface GroupEntry {
  readonly id: GroupId;
  readonly record: GroupRecord;
  /** Insertion sequence; document order of groups. */
  readonly seq: number;
  /** Members that have a node entry, in node insertion order. */
  readonly members: readonly NodeId[];
  readonly frame: Rect<W>;
  readonly titleStrip: Rect<W>;
}

export interface GroupHit {
  readonly groupId: GroupId;
  readonly part: GroupFramePart;
}

export interface GroupFrames {
  get(id: GroupId): GroupEntry | undefined;
  /** Every group that has a frame, in document order. */
  list(): readonly GroupEntry[];
  /** Rebuild one group from the reader; drops it when it is gone or has no frame. */
  set(id: GroupId): void;
  clear(): void;
  /** Groups whose frame intersects `rect`, in document order. */
  inRect(rect: Rect<W>): GroupEntry[];
  /** Frames under `point`, topmost (last in document order) first. */
  hitsAt(point: Point<W>, zoom: number, tolerance: number): GroupHit[];
  /** Entries computed since creation. */
  rebuilds(): number;
}

export function createGroupFrames(
  reader: GraphReader,
  node: (id: NodeId) => NodeEntry | undefined,
  metrics: GroupFrameMetrics,
): GroupFrames {
  const entries = new Map<GroupId, GroupEntry>();
  let ordered: readonly GroupEntry[] | undefined;
  let rebuilds = 0;

  const list = (): readonly GroupEntry[] => {
    ordered ??= [...entries.values()].sort((a, b) => a.seq - b.seq);
    return ordered;
  };

  return {
    get: (id) => entries.get(id),
    list,
    set(id) {
      ordered = undefined;
      const record = reader.getGroup(id);
      if (!record) {
        entries.delete(id);
        return;
      }
      rebuilds++;
      const members: NodeId[] = [];
      const bounds: Rect<W>[] = [];
      for (const member of reader.groupMembers(id)) {
        const entry = node(member.id);
        if (!entry) continue;
        members.push(member.id);
        bounds.push(entry.bodyBounds);
      }
      const frame = groupFrame(bounds, metrics);
      if (!frame) {
        entries.delete(id);
        return;
      }
      entries.set(id, {
        id,
        record,
        seq: reader.seqOf(id) ?? 0,
        members,
        frame,
        titleStrip: groupTitleStrip(frame, metrics),
      });
    },
    clear() {
      entries.clear();
      ordered = undefined;
    },
    inRect: (rect) => list().filter((e) => rectsIntersect(e.frame, rect)),
    hitsAt(point, zoom, tolerance) {
      const hits: GroupHit[] = [];
      const all = list();
      for (let i = all.length - 1; i >= 0; i--) {
        const entry = all[i] as GroupEntry;
        const part = groupFramePartAt(
          entry.frame,
          metrics,
          point,
          zoom,
          tolerance,
        );
        if (part) hits.push({ groupId: entry.id, part });
      }
      return hits;
    },
    rebuilds: () => rebuilds,
  };
}
