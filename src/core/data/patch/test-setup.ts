/** Shared fixture for patch tests: a store seeded with two connected nodes. */
import { portId } from "../../base/ids/ids.js";
import { createGraphReader } from "../model/reader.js";
import { createGraphStore } from "../model/store.js";
import { mkConn, mkNode, mkPort } from "../model/test-helpers.js";
import { applyPatch } from "./apply.js";
import type { Patch } from "./types.js";
import type { PatchValidator } from "./validator.js";

export function seeded() {
  const store = createGraphStore();
  store.batch((tx) => {
    tx.putNode(mkNode("n1", { ports: [portId("p1")] }));
    tx.putNode(mkNode("n2", { ports: [portId("p2"), portId("p3")] }));
    tx.putPort(mkPort("p1", "n1"));
    tx.putPort(mkPort("p2", "n2"));
    tx.putPort(mkPort("p3", "n2"));
    tx.putConnection(mkConn("c1", "n1", "p1", "n2", "p2"));
    tx.putConnection(mkConn("c2", "n1", "p1", "n2", "p3"));
  });
  const reader = createGraphReader(store);
  const apply = (patch: Patch, validators: readonly PatchValidator[] = []) =>
    applyPatch(store, reader, patch, validators, {
      origin: "local",
      operationId: "op1",
    });
  return { store, reader, apply };
}
