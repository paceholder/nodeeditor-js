/**
 * Convenience methods (PAT-05).
 *
 * Each one builds the matching command and calls `execute`, so a method and the explicit
 * command give identical results by construction.
 */
import type { ConnectionId, NodeId } from "../../base/ids/ids.js";
import type { Endpoint, Payload } from "../../data/model/records.js";
import type { Vec2 } from "../../data/model/values.js";
import type { CommandApi } from "./api.js";
import type { Command, ExecuteResult, PortEdit } from "./types.js";

type Of<K extends Command["kind"]> = Extract<Command, { kind: K }>;

export interface ConvenienceMethods {
  createNode(
    type: string,
    position: Vec2,
    extra?: { readonly payload?: Payload; readonly title?: string },
  ): ExecuteResult;
  deleteEntities(targets: {
    readonly nodes?: readonly NodeId[];
    readonly connections?: readonly ConnectionId[];
  }): ExecuteResult;
  connect(from: Endpoint, to: Endpoint, connectionKind?: string): ExecuteResult;
  reconnect(
    connection: ConnectionId,
    end: "from" | "to",
    target: Endpoint,
  ): ExecuteResult;
  disconnect(connection: ConnectionId): ExecuteResult;
  moveNodes(moves: Of<"moveNodes">["moves"]): ExecuteResult;
  rotateNodes(nodes: readonly NodeId[], turns: 1 | -1): ExecuteResult;
  mirrorNodes(nodes: readonly NodeId[]): ExecuteResult;
  reorderNodes(nodes: readonly NodeId[], to: "front" | "back"): ExecuteResult;
  setPorts(
    node: NodeId,
    ports: readonly PortEdit[],
    affected: "remove" | "reject",
  ): ExecuteResult;
  updateNode(
    node: NodeId,
    changes: {
      readonly title?: string;
      readonly status?: string;
      readonly payload?: Payload;
    },
  ): ExecuteResult;
}

export function createConvenience(api: CommandApi): ConvenienceMethods {
  return {
    createNode: (type, position, extra = {}) =>
      api.execute({ kind: "createNode", type, position, ...extra }),
    deleteEntities: (targets) =>
      api.execute({ kind: "deleteEntities", ...targets }),
    connect: (from, to, connectionKind) =>
      api.execute({
        kind: "connect",
        from,
        to,
        ...(connectionKind === undefined ? {} : { connectionKind }),
      }),
    reconnect: (connection, end, target) =>
      api.execute({ kind: "reconnect", connection, end, target }),
    disconnect: (connection) => api.execute({ kind: "disconnect", connection }),
    moveNodes: (moves) => api.execute({ kind: "moveNodes", moves }),
    rotateNodes: (nodes, turns) =>
      api.execute({ kind: "rotateNodes", nodes, turns }),
    mirrorNodes: (nodes) => api.execute({ kind: "mirrorNodes", nodes }),
    reorderNodes: (nodes, to) =>
      api.execute({ kind: "reorderNodes", nodes, to }),
    setPorts: (node, ports, affected) =>
      api.execute({ kind: "setPorts", node, ports, affected }),
    updateNode: (node, changes) =>
      api.execute({ kind: "updateNode", node, ...changes }),
  };
}
