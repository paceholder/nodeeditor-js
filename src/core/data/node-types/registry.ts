/**
 * Node type registry.
 *
 * Each model owns its own registry; types are registered independently, and listing
 * follows registration order so results are deterministic.
 */
import { ok, type Result, reject } from "../../base/result.js";
import type { NodeTypeDefinition } from "./definition.js";

export interface NodeTypeRegistry {
  /** Fails with `duplicate-type` if the key is already registered. */
  register(definition: NodeTypeDefinition): Result<void>;
  get(type: string): NodeTypeDefinition | undefined;
  has(type: string): boolean;
  /** Creatable types in registration order. */
  creatable(): readonly NodeTypeDefinition[];
}

export function createNodeTypeRegistry(): NodeTypeRegistry {
  const types = new Map<string, NodeTypeDefinition>();
  return {
    register(definition) {
      if (typeof definition.type !== "string" || definition.type === "") {
        return reject("malformed-record", "Node type key must not be empty");
      }
      if (types.has(definition.type)) {
        return reject(
          "duplicate-type",
          `Node type ${definition.type} is already registered`,
          [definition.type],
        );
      }
      types.set(definition.type, definition);
      return ok(undefined);
    },
    get: (type) => types.get(type),
    has: (type) => types.has(type),
    creatable: () => [...types.values()].filter((d) => d.creatable !== false),
  };
}
