/**
 * Default connection policy.
 *
 * Checks, in order:
 * 1. Both ports exist, belong to their nodes, and are different ports.
 * 2. Direction: two undirected ports are allowed; an output and an input are accepted
 *    and normalized so `from` is the output; anything else is a direction mismatch.
 * 3. Equal `typeKey`.
 * 4. No self-loop on one node, unless `selfLoops` is enabled.
 * 5. No duplicate: ordered pairs when directed, unordered when undirected, unless
 *    `parallel` is enabled.
 * 6. Attachment limit at each port, ignoring the connection being replaced.
 *
 * Cycles through different nodes are never checked, so they are allowed. Hosts replace
 * the policy object, or wrap this one and delegate to it.
 */
import type { PortId } from "../../base/ids/ids.js";
import { rejectionOf } from "../../base/result.js";
import type { GraphReader } from "../../data/model/reader.js";
import type { PortRecord } from "../../data/model/records.js";
import type {
  ConnectionPolicy,
  ConnectionProposal,
  PolicyOutcome,
} from "./types.js";

export interface DefaultPolicyOptions {
  /** Allow a connection between two ports of the same node. Default false. */
  readonly selfLoops?: boolean;
  /** Allow several connections between the same two ports. Default false. */
  readonly parallel?: boolean;
}

const refuse = (
  code: Parameters<typeof rejectionOf>[0],
  message: string,
  entities: readonly string[],
): PolicyOutcome => ({
  kind: "reject",
  reason: rejectionOf(code, message, entities),
});

function occupied(
  graph: GraphReader,
  port: PortRecord,
  proposal: ConnectionProposal,
): boolean {
  if (port.limit === "unlimited") return false;
  const used = graph
    .connectionsOfPort(port.id)
    .filter((c) => c.id !== proposal.replacing).length;
  return used >= port.limit;
}

function isDuplicate(
  graph: GraphReader,
  from: PortId,
  to: PortId,
  unordered: boolean,
  proposal: ConnectionProposal,
): boolean {
  return graph
    .connectionsOfPort(from)
    .some(
      (c) =>
        c.id !== proposal.replacing &&
        ((c.from.port === from && c.to.port === to) ||
          (unordered && c.from.port === to && c.to.port === from)),
    );
}

export function createDefaultConnectionPolicy(
  options: DefaultPolicyOptions = {},
): ConnectionPolicy {
  const selfLoops = options.selfLoops ?? false;
  const parallel = options.parallel ?? false;
  return {
    evaluate(proposal, graph) {
      const a = graph.getPort(proposal.from.port);
      const b = graph.getPort(proposal.to.port);
      if (!a || !b) {
        const missing = a ? proposal.to.port : proposal.from.port;
        return refuse("unknown-entity", `Port ${missing} does not exist`, [
          missing,
        ]);
      }
      if (a.node !== proposal.from.node || b.node !== proposal.to.node) {
        return refuse(
          "port-node-mismatch",
          "A port does not belong to the node named in its endpoint",
          [a.id, b.id],
        );
      }
      if (a.id === b.id) {
        return refuse("same-port", "A port cannot connect to itself", [a.id]);
      }

      const undirected =
        a.direction === "undirected" && b.direction === "undirected";
      const forward = a.direction === "output" && b.direction === "input";
      const backward = a.direction === "input" && b.direction === "output";
      if (!undirected && !forward && !backward) {
        return refuse(
          "direction-mismatch",
          `Cannot connect ${a.direction} port ${a.id} to ${b.direction} port ${b.id}`,
          [a.id, b.id],
        );
      }
      if (a.typeKey !== b.typeKey) {
        return refuse(
          "type-mismatch",
          `Port types differ: "${a.typeKey}" and "${b.typeKey}"`,
          [a.id, b.id],
        );
      }
      if (!selfLoops && a.node === b.node) {
        return refuse("self-loop", `Ports of node ${a.node} cannot be joined`, [
          a.node,
        ]);
      }
      const swap = backward;
      const [src, dst] = swap ? [b, a] : [a, b];
      if (
        !parallel &&
        isDuplicate(graph, src.id, dst.id, undirected, proposal)
      ) {
        return refuse(
          "duplicate-connection",
          `Ports ${src.id} and ${dst.id} are already connected`,
          [src.id, dst.id],
        );
      }
      for (const port of [src, dst]) {
        if (occupied(graph, port, proposal)) {
          return refuse(
            "capacity-exhausted",
            `Port ${port.id} has no free attachment`,
            [port.id],
          );
        }
      }
      return {
        kind: "accept",
        plan: {
          from: swap ? proposal.to : proposal.from,
          to: swap ? proposal.from : proposal.to,
          connectionKind: proposal.kind ?? "default",
          auxiliary: [],
        },
      };
    },
  };
}
