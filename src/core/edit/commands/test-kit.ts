/** Shared fixtures for command, policy and capability tests. */
import type { ConnectionId, NodeId, PortId } from "../../base/ids/ids.js";
import type { Endpoint } from "../../data/model/records.js";
import { createNodeTypeRegistry } from "../../data/node-types/registry.js";
import {
  createGraphModel,
  type GraphModel,
  type GraphModelOptions,
} from "../../graph-model.js";

const size = { width: 40, height: 20 };

/** A model with a few generic node types registered. */
export function makeModel(options: GraphModelOptions = {}): GraphModel {
  const registry = options.registry ?? createNodeTypeRegistry();
  if (!options.registry) {
    registry.register({
      type: "source",
      label: "Source",
      defaultSize: size,
      ports: () => [{ direction: "output", typeKey: "signal" }],
    });
    registry.register({
      type: "sink",
      label: "Sink",
      defaultSize: size,
      ports: () => [{ direction: "input", typeKey: "signal" }],
    });
    registry.register({
      type: "pipe",
      label: "Pipe",
      defaultSize: size,
      ports: () => [
        { direction: "undirected", typeKey: "hydraulic" },
        { direction: "undirected", typeKey: "hydraulic" },
      ],
    });
    registry.register({
      type: "shaft",
      label: "Shaft",
      defaultSize: size,
      ports: () => [
        { direction: "undirected", typeKey: "mechanical" },
        { direction: "undirected", typeKey: "mechanical" },
      ],
    });
  }
  return createGraphModel({ ...options, registry });
}

export interface Made {
  readonly node: NodeId;
  readonly ports: readonly PortId[];
  readonly ends: readonly Endpoint[];
}

/** Create a node through the command pipeline and return its IDs. */
export function make(model: GraphModel, type: string, x = 0, y = 0): Made {
  const result = model.createNode(type, { x, y });
  if (result.status !== "accepted") throw new Error(`create ${type} failed`);
  const node = model.reader.nodes().at(-1);
  if (!node) throw new Error("no node");
  return {
    node: node.id,
    ports: node.ports,
    ends: node.ports.map((port) => ({ node: node.id, port })),
  };
}

export function end(made: Made, index = 0): Endpoint {
  const e = made.ends[index];
  if (!e) throw new Error("no such port");
  return e;
}

export function firstConnection(model: GraphModel): ConnectionId {
  const c = model.reader.connections()[0];
  if (!c) throw new Error("no connection");
  return c.id;
}
