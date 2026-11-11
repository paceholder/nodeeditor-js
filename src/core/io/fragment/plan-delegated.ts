/**
 * Paste and duplicate when the host names nodes.
 *
 * The fragment has already been validated and its types checked, exactly as for a local
 * paste. Instead of a patch the planner builds one create-fragment intent: the nodes with
 * their ports, the internal connections between fragment-local keys, the placement
 * offset, and, only when the command asked to preserve them, the connections to existing
 * ports outside the fragment. Nothing is created and no ID is minted. The connection
 * policy does not judge these connections: their fragment ports do not exist in the
 * library yet, so the host owns that decision.
 */
import type { NodeId, OperationId, PortId } from "../../base/ids/ids.js";
import type { Payload } from "../../data/model/records.js";
import type { Vec2 } from "../../data/model/values.js";
import type {
  ExcludedReference,
  ExternalHandling,
  PlanContext,
  PlanResult,
} from "../../edit/commands/types.js";
import type {
  FragmentConnectionIntent,
  FragmentEndpoint,
  FragmentNodeIntent,
} from "../../edit/intents/delegated-types.js";
import type { EndpointSnapshot } from "../snapshot/snapshot-types.js";
import type { ClipboardFragment } from "./fragment-types.js";

/** Fragment-local keys by original ID; read by key only, never iterated for output. */
interface Keys {
  readonly nodes: Map<string, string>;
  readonly ports: Map<string, string>;
}

function keyed(fragment: ClipboardFragment): Keys {
  const nodes = new Map<string, string>();
  const ports = new Map<string, string>();
  let port = 0;
  fragment.fragment.nodes.forEach((n, i) => {
    nodes.set(n.id, `node-${i + 1}`);
    for (const p of n.ports) ports.set(p.id, `port-${++port}`);
  });
  return { nodes, ports };
}

function inside(
  end: EndpointSnapshot,
  keys: Keys,
): FragmentEndpoint | undefined {
  const node = keys.nodes.get(end.node);
  const port = keys.ports.get(end.port);
  return node && port ? { in: "fragment", node, port } : undefined;
}

/** An existing port of the model that still belongs to the named node. */
function outside(
  end: EndpointSnapshot,
  ctx: PlanContext,
): FragmentEndpoint | undefined {
  const port = ctx.reader.getPort(end.port as PortId);
  return port && port.node === end.node
    ? { in: "model", node: port.node as NodeId, port: port.id }
    : undefined;
}

export function planDelegatedFragment(
  read: {
    readonly fragment: ClipboardFragment;
    readonly payloads: readonly Payload[];
  },
  offset: Vec2,
  external: ExternalHandling,
  label: string,
  operationId: OperationId,
  ctx: PlanContext,
): PlanResult {
  const { fragment, payloads } = read;
  const keys = keyed(fragment);
  const key = (map: Map<string, string>, id: string): string =>
    map.get(id) ?? id;
  const nodes = fragment.fragment.nodes.map(
    (n, i): FragmentNodeIntent => ({
      key: key(keys.nodes, n.id),
      type: n.type,
      position: n.position,
      ...(n.title === undefined ? {} : { title: n.title }),
      payload: payloads[i] ?? null,
      ports: n.ports.map((p) => ({
        key: key(keys.ports, p.id),
        direction: p.direction,
        typeKey: p.typeKey,
        ...(p.label === undefined ? {} : { label: p.label }),
      })),
    }),
  );
  const connections: FragmentConnectionIntent[] = [];
  let count = 0;
  const add = (
    c: (typeof fragment.external)[number],
    from: FragmentEndpoint,
    to: FragmentEndpoint,
  ) =>
    connections.push({
      key: `connection-${++count}`,
      ...(c.kind === undefined ? {} : { kind: c.kind }),
      from,
      to,
      ...(c.route === undefined ? {} : { route: c.route }),
    });
  for (const c of fragment.fragment.connections) {
    const from = inside(c.from, keys);
    const to = inside(c.to, keys);
    // The validator checked every internal reference.
    if (from && to) add(c, from, to);
  }
  const excluded: ExcludedReference[] = [];
  for (const c of fragment.external) {
    const id = c.id as ExcludedReference["connection"];
    const from = inside(c.from, keys);
    const to = inside(c.to, keys);
    if (external === "exclude" || (!from && !to)) {
      excluded.push({ connection: id, reason: "external" });
      continue;
    }
    const fromEnd = from ?? outside(c.from, ctx);
    const toEnd = to ?? outside(c.to, ctx);
    if (!fromEnd || !toEnd) {
      excluded.push({ connection: id, reason: "endpoint-missing" });
      continue;
    }
    add(c, fromEnd, toEnd);
  }
  return {
    kind: "delegated",
    label,
    intent: {
      kind: "create-fragment",
      operationId,
      nodes,
      connections,
      offset,
    },
    excluded,
  };
}
