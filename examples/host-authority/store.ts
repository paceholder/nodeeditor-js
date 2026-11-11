/**
 * The host's own store: a document of two lists, nodes and links, in its own format.
 *
 * Nothing here knows the editor library. The store names nodes and their pins itself, keeps
 * the IDs clients give links, and applies a batch of operations atomically or not at all.
 * Every call goes through a fake asynchronous transport, as a remote service would.
 */

export interface StoredPin {
  readonly id: string;
  readonly dir: "in" | "out";
}

export interface StoredNode {
  readonly id: string;
  readonly kind: string;
  readonly x: number;
  readonly y: number;
  readonly label: string;
  readonly pins: readonly StoredPin[];
}

export interface PinRef {
  readonly node: string;
  readonly pin: string;
}

export interface StoredLink {
  readonly id: string;
  readonly a: PinRef;
  readonly b: PinRef;
}

export interface StoreDocument {
  /** Increases by one per committed batch. */
  readonly version: number;
  readonly nodes: readonly StoredNode[];
  readonly links: readonly StoredLink[];
}

export type StoreOp =
  | {
      readonly op: "add-node";
      readonly kind: string;
      readonly x: number;
      readonly y: number;
      readonly label: string;
    }
  | {
      readonly op: "move-node";
      readonly id: string;
      readonly x: number;
      readonly y: number;
    }
  | { readonly op: "remove-node"; readonly id: string }
  | {
      readonly op: "add-link";
      readonly id: string;
      readonly a: PinRef;
      readonly b: PinRef;
    }
  | {
      readonly op: "relink";
      readonly id: string;
      readonly a: PinRef;
      readonly b: PinRef;
    }
  | { readonly op: "remove-link"; readonly id: string };

export type StoreReply =
  | {
      readonly ok: true;
      readonly version: number;
      readonly created: readonly string[];
    }
  | {
      readonly ok: false;
      readonly code: "already-linked" | "id-in-use" | "not-found" | "bad-kind";
      readonly message: string;
    };

type Failure = Extract<StoreReply, { ok: false }>;

/** The pins a node of each kind gets; the store alone decides them. */
const PINS_BY_KIND: Readonly<Record<string, readonly ("in" | "out")[]>> = {
  source: ["out"],
  relay: ["in", "out"],
  sink: ["in"],
};

export interface Store {
  /** Read the whole document, as a client would fetch it. */
  read(): Promise<StoreDocument>;
  /** Apply a batch atomically: every operation or none. */
  apply(ops: readonly StoreOp[]): Promise<StoreReply>;
  /** Called after every committed batch, once the transport delivers the notice. */
  onChange(listener: () => void): () => void;
  /** The document as it is now, for inspection in tests. */
  peek(): StoreDocument;
  /** Every batch received, committed or not. */
  readonly received: (readonly StoreOp[])[];
}

/** A transport that answers after `latencyMs` (0 still answers asynchronously). */
const deliver = <T>(latencyMs: number, value: () => T): Promise<T> =>
  new Promise((resolve) => setTimeout(() => resolve(value()), latencyMs));

const failure = (code: Failure["code"], message: string): Failure => ({
  ok: false,
  code,
  message,
});

const samePin = (x: PinRef, y: PinRef) => x.node === y.node && x.pin === y.pin;

/** Links join the same pins; both orders count, which matters for undirected links. */
const sameEnds = (link: StoredLink, a: PinRef, b: PinRef) =>
  (samePin(link.a, a) && samePin(link.b, b)) ||
  (samePin(link.a, b) && samePin(link.b, a));

interface Draft {
  nodes: StoredNode[];
  links: StoredLink[];
  nextNode: number;
  created: string[];
}

function hasPin(draft: Draft, ref: PinRef): boolean {
  const node = draft.nodes.find((n) => n.id === ref.node);
  return node?.pins.some((p) => p.id === ref.pin) ?? false;
}

function checkLink(
  draft: Draft,
  id: string,
  a: PinRef,
  b: PinRef,
): Failure | undefined {
  if (!hasPin(draft, a) || !hasPin(draft, b))
    return failure("not-found", `Link ${id} names a pin that does not exist`);
  const other = draft.links.find((l) => l.id !== id && sameEnds(l, a, b));
  if (other)
    return failure(
      "already-linked",
      `These pins are already linked by ${other.id}`,
    );
  return undefined;
}

function addLink(
  draft: Draft,
  op: Extract<StoreOp, { op: "add-link" }>,
): Failure | undefined {
  const existing = draft.links.find((l) => l.id === op.id);
  // A retried call with the same ID and the same pins is the same link, not a second one.
  if (existing && sameEnds(existing, op.a, op.b)) return undefined;
  if (existing || draft.nodes.some((n) => n.id === op.id))
    return failure("id-in-use", `The ID ${op.id} is already in use`);
  const problem = checkLink(draft, op.id, op.a, op.b);
  if (problem) return problem;
  draft.links.push({ id: op.id, a: op.a, b: op.b });
  return undefined;
}

function applyOp(draft: Draft, op: StoreOp): Failure | undefined {
  switch (op.op) {
    case "add-node": {
      const dirs = PINS_BY_KIND[op.kind];
      if (!dirs)
        return failure("bad-kind", `The store has no node kind ${op.kind}`);
      draft.nextNode += 1;
      const id = `node-${draft.nextNode}`;
      const pins = dirs.map((dir, i) => ({ id: `${id}/${dir}${i}`, dir }));
      draft.nodes.push({
        id,
        kind: op.kind,
        x: op.x,
        y: op.y,
        label: op.label,
        pins,
      });
      draft.created.push(id);
      return undefined;
    }
    case "move-node": {
      const i = draft.nodes.findIndex((n) => n.id === op.id);
      const node = draft.nodes[i];
      if (!node) return failure("not-found", `No node ${op.id}`);
      draft.nodes[i] = { ...node, x: op.x, y: op.y };
      return undefined;
    }
    case "remove-node": {
      if (!draft.nodes.some((n) => n.id === op.id))
        return failure("not-found", `No node ${op.id}`);
      draft.nodes = draft.nodes.filter((n) => n.id !== op.id);
      draft.links = draft.links.filter(
        (l) => l.a.node !== op.id && l.b.node !== op.id,
      );
      return undefined;
    }
    case "add-link":
      return addLink(draft, op);
    case "relink": {
      const i = draft.links.findIndex((l) => l.id === op.id);
      if (i < 0) return failure("not-found", `No link ${op.id}`);
      const problem = checkLink(draft, op.id, op.a, op.b);
      if (problem) return problem;
      draft.links[i] = { id: op.id, a: op.a, b: op.b };
      return undefined;
    }
    case "remove-link": {
      // Removing a link the node removal already took is fine.
      draft.links = draft.links.filter((l) => l.id !== op.id);
      return undefined;
    }
  }
}

export function createStore(
  options: { readonly latencyMs?: number } = {},
): Store {
  const latency = options.latencyMs ?? 0;
  let doc: StoreDocument = { version: 1, nodes: [], links: [] };
  let nextNode = 0;
  const listeners = new Set<() => void>();
  const received: (readonly StoreOp[])[] = [];

  function commit(ops: readonly StoreOp[]): StoreReply {
    const draft: Draft = {
      nodes: [...doc.nodes],
      links: [...doc.links],
      nextNode,
      created: [],
    };
    for (const op of ops) {
      const problem = applyOp(draft, op);
      if (problem) return problem;
    }
    nextNode = draft.nextNode;
    doc = { version: doc.version + 1, nodes: draft.nodes, links: draft.links };
    for (const listener of [...listeners]) void deliver(latency, listener);
    return { ok: true, version: doc.version, created: draft.created };
  }

  return {
    read: () => deliver(latency, () => doc),
    apply: (ops) => {
      received.push(ops);
      return deliver(latency, () => commit(ops));
    },
    onChange: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    peek: () => doc,
    received,
  };
}
