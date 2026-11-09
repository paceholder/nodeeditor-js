/** Fixtures shared by snapshot tests. */

import { createNodeTypeRegistry } from "../../data/node-types/registry.js";
import { createGraphModel, type GraphModel } from "../../graph-model.js";
import { loadSnapshot } from "./load.js";
import type { GraphSnapshot } from "./snapshot-types.js";

/** A small valid snapshot as untrusted-looking plain data. */
export function sampleSnapshot(): Record<string, unknown> {
  return {
    format: "@paceholder/nodeeditor-js/graph",
    version: 1,
    idCursor: { c: 1, n: 2, p: 3 },
    nodes: [
      {
        id: "n1",
        type: "pipe",
        position: { x: 0, y: 0 },
        size: { width: 40, height: 20 },
        title: "A",
        ports: [
          { id: "p1", direction: "undirected", typeKey: "hydraulic" },
          { id: "p2", direction: "undirected", typeKey: "hydraulic" },
        ],
        payload: { length: 2, tags: ["x"] },
      },
      {
        id: "n2",
        type: "pipe",
        position: { x: 100, y: 0 },
        size: { width: 40, height: 20 },
        z: 1,
        rotation: 1,
        ports: [{ id: "p3", direction: "undirected", typeKey: "hydraulic" }],
        payload: null,
      },
    ],
    connections: [
      {
        id: "c1",
        from: { node: "n1", port: "p2" },
        to: { node: "n2", port: "p3" },
      },
    ],
  };
}

export function makeTestModel(registerPipe = true): GraphModel {
  const registry = createNodeTypeRegistry();
  if (registerPipe) {
    registry.register({
      type: "pipe",
      label: "Pipe",
      defaultSize: { width: 40, height: 20 },
      ports: () => [],
    });
  }
  return createGraphModel({ registry });
}

export function loadedModel(
  input: unknown = sampleSnapshot(),
  registerPipe = true,
): GraphModel {
  const model = makeTestModel(registerPipe);
  const result = loadSnapshot(model, input);
  if (!result.ok)
    throw new Error(`fixture failed: ${JSON.stringify(result.rejection)}`);
  return model;
}

export type { GraphSnapshot };
