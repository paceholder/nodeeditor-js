/**
 * Ghost entries for drag previews (D6, D8). A preview that draws nodes
 * at a hypothetical placement hides them and their incident connections from the scene
 * layer, then paints replacements on the interaction layer: the changed node entries,
 * and incident connections re-routed between the changed anchors and the anchors of
 * nodes that stay where they are, each with the router of its kind.
 */
import type {
  ConnectionEntry,
  GeometryScene,
  GraphReader,
  NodeEntry,
  NodeId,
  RouteEnd,
  RouteRegistry,
} from "../../../../core/index.js";

export interface GhostSource {
  readonly reader: GraphReader;
  readonly scene: Pick<GeometryScene, "node" | "connection">;
  readonly routes: Pick<RouteRegistry, "get">;
}

/** IDs the scene layer must skip while a preview draws `nodes`: them and their paths. */
export function previewedEntityIds(
  reader: GraphReader,
  nodes: readonly NodeId[],
): Set<string> {
  const ids = new Set<string>();
  for (const id of nodes) {
    ids.add(id);
    for (const c of reader.connectionsOfNode(id)) ids.add(c.id);
  }
  return ids;
}

function ghostConnection(
  e: ConnectionEntry,
  changed: ReadonlyMap<string, NodeEntry>,
  source: GhostSource,
): ConnectionEntry | undefined {
  const end = (node: string, port: string): RouteEnd | undefined => {
    const entry = changed.get(node) ?? source.scene.node(node as NodeId);
    const a = entry?.anchors.find((x) => x.portId === port);
    return a && entry
      ? { position: a.position, normal: a.normal, body: entry.bodyBounds }
      : undefined;
  };
  const from = end(e.record.from.node, e.record.from.port);
  const to = end(e.record.to.node, e.record.to.port);
  if (!from || !to) return undefined;
  const { path, outcome } = source.routes
    .get(e.record.kind)
    .route({ from, to });
  return { ...e, path, route: outcome, paintedBounds: undefined };
}

/** Incident connections of the changed nodes, each once, routed to the new anchors. */
export function ghostConnections(
  changed: ReadonlyMap<string, NodeEntry>,
  source: GhostSource,
): ConnectionEntry[] {
  const out: ConnectionEntry[] = [];
  const seen = new Set<string>();
  for (const id of changed.keys()) {
    for (const c of source.reader.connectionsOfNode(id as NodeId)) {
      if (seen.has(c.id)) continue;
      seen.add(c.id);
      const entry = source.scene.connection(c.id);
      const ghost = entry && ghostConnection(entry, changed, source);
      if (ghost) out.push(ghost);
    }
  }
  return out;
}
