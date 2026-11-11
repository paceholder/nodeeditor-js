/** Shared fixtures for command, policy and capability tests. */

import { createCounterIdGenerator } from "../../base/ids/id-generator.js";
import type { ConnectionId, NodeId, PortId } from "../../base/ids/ids.js";
import type { Endpoint } from "../../data/model/records.js";
import { createNodeTypeRegistry } from "../../data/node-types/registry.js";
import {
  buildGraphModel,
  createGraphModel,
  type GraphModel,
  type GraphModelOptions,
} from "../../graph-model.js";
import { createLocalAdapter } from "../adapter/local-adapter.js";
import type { SubmitResult } from "../adapter/types.js";
import type { DelegatedIntent } from "../intents/delegated-types.js";

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

/**
 * A model over an adapter whose nodes are named by the host: a local adapter seeded
 * with `seed`'s document, declaring delegated creation and recording what it is handed.
 * The generator counts every call, so a test can prove no ID was minted.
 */
export function delegatingModel(
  options: { readonly readOnly?: boolean; readonly maxNodes?: number } = {},
) {
  const seed = makeModel();
  // Two connected pipes plus a third joined to the second.
  const a = make(seed, "pipe", 0, 0);
  const b = make(seed, "pipe", 100, 40);
  const c = make(seed, "pipe", 300, 0);
  seed.connect(end(a, 1), end(b, 0));
  seed.connect(end(b, 1), end(c, 0));
  const pair = { a, b, c };
  const counter = createCounterIdGenerator();
  const asked: string[] = [];
  const idGenerator = {
    next: (kind: Parameters<typeof counter.next>[0], cursor: never) => {
      asked.push(kind);
      return counter.next(kind, cursor);
    },
  };
  const local = createLocalAdapter({ idGenerator });
  local.replaceDocument({
    nodes: seed.reader.nodes(),
    ports: seed.reader.ports(),
    connections: seed.reader.connections(),
    idCursor: seed.idCursor(),
  });
  const intents: DelegatedIntent[] = [];
  const delegate = (intent: DelegatedIntent): SubmitResult => {
    intents.push(intent);
    return {
      status: "pending",
      operationId: intent.operationId,
      settled: new Promise(() => {}),
    };
  };
  const model = buildGraphModel(
    { ...local, nodeCreation: "delegated", delegate },
    {
      registry: seed.registry,
      ...(options.readOnly ? { readOnly: true } : {}),
      ...(options.maxNodes
        ? { fragmentLimits: { maxNodes: options.maxNodes } }
        : {}),
    },
  );
  asked.length = 0;
  return { model, intents, asked, pair, seed };
}
