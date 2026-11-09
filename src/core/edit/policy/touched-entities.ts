/**
 * The nodes and ports a patch touches.
 *
 * A cached verdict concerns the two ports of its plan and their nodes. A change that
 * touches none of them cannot alter the answer, so it must not discard the verdict. A
 * connection operation touches the endpoints it names, old and new, because attaching or
 * detaching a wire changes the capacity and duplicate rules of those ports.
 */
import type { Endpoint } from "../../data/model/records.js";
import type { Patch } from "../../data/patch/types.js";

export interface TouchedEntities {
  readonly nodes: ReadonlySet<string>;
  readonly ports: ReadonlySet<string>;
}

export function touchedBy(patch: Patch): TouchedEntities {
  const nodes = new Set<string>();
  const ports = new Set<string>();
  const endpoint = (e: Endpoint | undefined) => {
    if (!e) return;
    nodes.add(e.node);
    ports.add(e.port);
  };
  for (const op of patch.ops) {
    if (op.entity === "node") {
      nodes.add(op.op === "update" ? op.id : op.record.id);
    } else if (op.entity === "port") {
      ports.add(op.op === "update" ? op.id : op.record.id);
      if (op.op !== "update") nodes.add(op.record.node);
    } else if (op.op === "update") {
      endpoint(op.fields.from?.old);
      endpoint(op.fields.from?.new);
      endpoint(op.fields.to?.old);
      endpoint(op.fields.to?.new);
    } else {
      endpoint(op.record.from);
      endpoint(op.record.to);
    }
  }
  return { nodes, ports };
}
