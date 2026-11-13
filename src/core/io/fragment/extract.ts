/**
 * Fragment extraction for copy, cut and duplicate.
 *
 * The copied nodes come out in paint order with their ports in presentation order,
 * dynamic ports included. Every connection whose two ends are copied nodes is internal
 * and copied, whether or not it was selected. Connections reaching outside the set are
 * listed in `external` and reported as excluded, never copied. A selected group is copied
 * with all its members; a node whose group is not selected is copied as a free node.
 * Original IDs are kept;
 * paste remaps them, so one fragment can be pasted any number of times. Payloads go
 * through the type's codec or must be plain JSON, exactly as `saveDocument` requires.
 */
import type { ConnectionId, GroupId, NodeId } from "../../base/ids/ids.js";
import {
  err,
  ok,
  type Rejection,
  type Result,
  rejectionOf,
} from "../../base/result.js";
import type { GraphReader } from "../../data/model/reader.js";
import type {
  ConnectionRecord,
  GroupRecord,
  NodeRecord,
} from "../../data/model/records.js";
import { checkJson } from "../snapshot/json-value.js";
import {
  connectionToSnapshot,
  groupToSnapshot,
  nodeToSnapshot,
} from "../snapshot/records.js";
import {
  type PayloadCodecRegistry,
  resolveLimits,
  type SnapshotLimits,
} from "../snapshot/snapshot-errors.js";
import type { NodeSnapshot } from "../snapshot/snapshot-types.js";
import { FORMAT_VERSION, SNAPSHOT_FORMAT } from "../snapshot/snapshot-types.js";
import {
  type ClipboardFragment,
  type ExcludedReference,
  FRAGMENT_FORMAT,
  FRAGMENT_VERSION,
} from "./fragment-types.js";

export interface FragmentSelection {
  readonly nodes: readonly NodeId[];
  /** Selected connections; internal ones are copied anyway, others are external. */
  readonly connections?: readonly ConnectionId[];
  /** Selected groups: each is copied together with all of its members. */
  readonly groups?: readonly GroupId[];
}

export interface ExtractOptions {
  readonly codecs?: PayloadCodecRegistry;
  /** Only `maxPayloadDepth` applies to extraction. */
  readonly limits?: Partial<SnapshotLimits>;
}

export interface ExtractedFragment {
  readonly fragment: ClipboardFragment;
  /** External connections, each with reason `external`. */
  readonly excluded: readonly ExcludedReference[];
}

function bySeq(reader: GraphReader) {
  return (a: { id: NodeId | ConnectionId }, b: { id: NodeId | ConnectionId }) =>
    (reader.seqOf(a.id) ?? 0) - (reader.seqOf(b.id) ?? 0);
}

function encodeNode(
  node: NodeRecord,
  reader: GraphReader,
  options: ExtractOptions,
): Result<NodeSnapshot> {
  const snapshot = nodeToSnapshot(node, reader.portsOf(node.id));
  const codec = options.codecs?.get(node.type);
  if (codec) {
    const encoded = codec.encode(node.payload);
    if (!encoded.ok) {
      const e: Rejection = encoded.rejection;
      return err({ ...e, entities: [node.id, ...e.entities] });
    }
    return ok({ ...snapshot, payload: encoded.value });
  }
  const depth = resolveLimits(options.limits).maxPayloadDepth;
  const problem = checkJson(node.payload, "payload", depth);
  if (!problem) return ok(snapshot);
  return err(
    rejectionOf(
      problem.kind === "depth" ? "limit-exceeded" : "non-json-payload",
      `Payload of node ${node.id} cannot be copied: ${problem.reason} (register a codec for type ${node.type})`,
      [node.id],
    ),
  );
}

export function extractFragment(
  reader: GraphReader,
  selection: FragmentSelection,
  options: ExtractOptions = {},
): Result<ExtractedFragment> {
  const nodes: NodeRecord[] = [];
  const inSet = new Set<NodeId>();
  for (const id of selection.nodes) {
    const node = reader.getNode(id);
    if (!node) {
      return err(rejectionOf("unknown-entity", `${id} does not exist`, [id]));
    }
    if (!inSet.has(id)) nodes.push(node);
    inSet.add(id);
  }
  const groups: GroupRecord[] = [];
  for (const id of new Set(selection.groups ?? [])) {
    const group = reader.getGroup(id);
    if (!group) {
      return err(rejectionOf("unknown-entity", `${id} does not exist`, [id]));
    }
    groups.push(group);
    for (const member of reader.groupMembers(id)) {
      if (!inSet.has(member.id)) nodes.push(member);
      inSet.add(member.id);
    }
  }
  if (nodes.length === 0) {
    return err(
      rejectionOf("empty-fragment", "Select at least one node to copy"),
    );
  }
  // Paint order is (z, seq) ascending.
  const order = bySeq(reader);
  nodes.sort((a, b) => a.z - b.z || order(a, b));

  const touched = new Map<ConnectionId, ConnectionRecord>();
  for (const node of nodes) {
    for (const c of reader.connectionsOfNode(node.id)) touched.set(c.id, c);
  }
  for (const id of selection.connections ?? []) {
    const c = reader.getConnection(id);
    if (!c) {
      return err(rejectionOf("unknown-entity", `${id} does not exist`, [id]));
    }
    touched.set(id, c);
  }
  // Read by key only; the output order comes from the sort.
  const connections = [...touched.values()].sort(order);
  const internal = connections.filter(
    (c) => inSet.has(c.from.node) && inSet.has(c.to.node),
  );
  const external = connections.filter(
    (c) => !(inSet.has(c.from.node) && inSet.has(c.to.node)),
  );

  groups.sort((a, b) => (reader.seqOf(a.id) ?? 0) - (reader.seqOf(b.id) ?? 0));
  const copied = new Set<string>(groups.map((g) => g.id));
  const encoded: NodeSnapshot[] = [];
  for (const node of nodes) {
    const one = encodeNode(node, reader, options);
    if (!one.ok) return one;
    const { group, ...free } = one.value;
    encoded.push(group !== undefined && copied.has(group) ? one.value : free);
  }
  return ok({
    fragment: {
      format: FRAGMENT_FORMAT,
      version: FRAGMENT_VERSION,
      fragment: {
        format: SNAPSHOT_FORMAT,
        version: FORMAT_VERSION,
        nodes: encoded,
        connections: internal.map(connectionToSnapshot),
        ...(groups.length > 0 ? { groups: groups.map(groupToSnapshot) } : {}),
      },
      external: external.map(connectionToSnapshot),
    },
    excluded: external.map((c) => ({ connection: c.id, reason: "external" })),
  });
}
