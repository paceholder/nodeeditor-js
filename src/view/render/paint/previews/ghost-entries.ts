/**
 * Ghost entries for drag previews (INT-03, INT-10, D6, D8). A preview that draws nodes
 * at a hypothetical placement hides them and their incident connections from the scene
 * layer, then paints replacements on the interaction layer: the changed node entries,
 * and incident connections re-routed between the changed anchors and the anchors of
 * nodes that stay where they are, each with the router of its kind (ROU-01e).
 */
import {
  type ConnectionEntry,
  type ConnectionId,
  type GeometryScene,
  type GraphReader,
  type NodeEntry,
  type NodeId,
  type RouteConstraint,
  type RouteEnd,
  type RouteRegistry,
  translateConstraints,
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

/**
 * The pins a ghost routes with: a connection whose two ends both move shifts them by the
 * mean node offset, as the move command will (ROU-03e); otherwise they stay.
 */
function ghostPins(
  e: ConnectionEntry,
  changed: ReadonlyMap<string, NodeEntry>,
  source: GhostSource,
): readonly RouteConstraint[] {
  const route = e.record.route ?? [];
  const a = changed.get(e.record.from.node);
  const b = changed.get(e.record.to.node);
  const was = (n: string) => source.scene.node(n as NodeId)?.record.position;
  const wasA = was(e.record.from.node);
  const wasB = was(e.record.to.node);
  if (route.length === 0 || !a || !b || !wasA || !wasB) return route;
  const dx = (a.record.position.x - wasA.x + b.record.position.x - wasB.x) / 2;
  const dy = (a.record.position.y - wasA.y + b.record.position.y - wasB.y) / 2;
  return translateConstraints(route, dx, dy);
}

function ghostConnection(
  e: ConnectionEntry,
  changed: ReadonlyMap<string, NodeEntry>,
  source: GhostSource,
  pins: readonly RouteConstraint[] = ghostPins(e, changed, source),
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
  const { path, outcome, realized } = source.routes
    .get(e.record.kind)
    .route({ from, to, constraints: pins });
  const { realized: _stale, ...rest } = e;
  return {
    ...rest,
    path,
    route: outcome,
    ...(realized ? { realized } : {}),
    paintedBounds: undefined,
  };
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

/**
 * `entry` re-routed through `route`, ends unchanged: the routing a route editor asks for
 * when it checks which constraints change nothing (ROU-03g, D12).
 */
export function rerouteEntry(
  entry: ConnectionEntry,
  route: readonly RouteConstraint[],
  source: GhostSource,
): ConnectionEntry | undefined {
  return ghostConnection(entry, new Map(), source, route);
}

/** A connection re-routed through tentative constraints, ends unchanged (ROU-03c). */
export function ghostWithRoute(
  id: ConnectionId,
  route: readonly RouteConstraint[],
  source: GhostSource,
): ConnectionEntry | undefined {
  const entry = source.scene.connection(id);
  return entry && ghostConnection(entry, new Map(), source, route);
}
