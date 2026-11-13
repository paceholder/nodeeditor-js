/**
 * Members of each group, kept sorted by the member node's `seq`, so listing a group costs
 * O(its members) and comes back in node collection order. Internal to the store.
 */
import type { GroupId, NodeId } from "../../base/ids/ids.js";

interface Item {
  readonly id: NodeId;
  readonly seq: number;
}

export interface GroupIndex {
  add(group: GroupId, node: NodeId, seq: number): void;
  remove(group: GroupId, node: NodeId): void;
  /** Member node IDs in node collection order. */
  membersOf(group: GroupId): readonly NodeId[];
}

export function createGroupIndex(): GroupIndex {
  const buckets = new Map<string, Item[]>();
  return {
    add(group, node, seq) {
      const bucket = buckets.get(group) ?? [];
      if (bucket.length === 0) buckets.set(group, bucket);
      let at = bucket.length;
      while (at > 0 && (bucket[at - 1] as Item).seq > seq) at -= 1;
      bucket.splice(at, 0, { id: node, seq });
    },
    remove(group, node) {
      const bucket = buckets.get(group);
      if (!bucket) return;
      const at = bucket.findIndex((i) => i.id === node);
      if (at >= 0) bucket.splice(at, 1);
      if (bucket.length === 0) buckets.delete(group);
    },
    membersOf: (group) => (buckets.get(group) ?? []).map((i) => i.id),
  };
}
