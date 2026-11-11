/** Fixtures for snapshot adapter tests: a fake host, a seeded adapter and edit builders. */
import { createCounterIdGenerator } from "../../base/ids/id-generator.js";
import { type NodeId, nodeId, operationId } from "../../base/ids/ids.js";
import type { GraphReader } from "../../data/model/reader.js";
import type { Vec2 } from "../../data/model/values.js";
import {
  createNodeTypeRegistry,
  type NodeTypeRegistry,
} from "../../data/node-types/registry.js";
import type { Patch } from "../../data/patch/types.js";
import type { HistoryState, Submission } from "../../edit/adapter/types.js";
import type {
  ChangeEvent,
  ConflictEvent,
  FailureEvent,
  ResyncRequestedEvent,
} from "../../edit/events/types.js";
import type { DelegatedIntent } from "../../edit/intents/delegated-types.js";
import type { VerdictTimers } from "../../edit/policy/verdict-env.js";
import {
  createSnapshotModel,
  type SnapshotModel,
  type SnapshotModelOptions,
} from "../../snapshot-model.js";
import { createSnapshotAdapter } from "./snapshot-adapter.js";
import type {
  HostAnswer,
  SnapshotAdapter,
  SnapshotAdapterBaseOptions,
  SnapshotCreationOptions,
  SnapshotHistoryOptions,
  SyncLogEntry,
} from "./sync-types.js";

/** A host whose answers the test gives by hand, in any order. */
export interface FakeHost {
  readonly calls: Submission[];
  /** Resolve the promise returned for the submission with this operation ID. */
  answer(id: string, answer: HostAnswer): void;
  fail(id: string, error: unknown): void;
  readonly onSubmit: (submission: Submission) => Promise<HostAnswer>;
}

export function fakeHost(): FakeHost {
  const calls: Submission[] = [];
  const waiting = new Map<
    string,
    { resolve(a: HostAnswer): void; reject(e: unknown): void }
  >();
  return {
    calls,
    answer: (id, answer) => waiting.get(id)?.resolve(answer),
    fail: (id, error) => waiting.get(id)?.reject(error),
    onSubmit: (submission) => {
      calls.push(submission);
      return new Promise<HostAnswer>((resolve, reject) => {
        waiting.set(submission.operationId, { resolve, reject });
      });
    },
  };
}

/** A host that names created nodes; the test answers each intent by hand. */
export function fakeCreator() {
  const intents: DelegatedIntent[] = [];
  const waiting = new Map<string, (a: HostAnswer) => void>();
  return {
    intents,
    answer: (id: string, answer: HostAnswer) => waiting.get(id)?.(answer),
    onDelegate: (intent: DelegatedIntent) => {
      intents.push(intent);
      return new Promise<HostAnswer>((resolve) =>
        waiting.set(intent.operationId, resolve),
      );
    },
  };
}

/** The node type of `hostSnapshot()`, so commands can create it. */
export function boxRegistry(): NodeTypeRegistry {
  const registry = createNodeTypeRegistry();
  registry.register({
    type: "box",
    label: "Box",
    defaultSize: { width: 40, height: 20 },
    ports: () => [{ direction: "undirected", typeKey: "k" }],
  });
  return registry;
}

/** A pushed snapshot: nodes A at (0,0) and B at (100,0) with one connection. */
export function hostSnapshot(
  mutate: (s: {
    nodes: Record<string, unknown>[];
    connections: Record<string, unknown>[];
  }) => void = () => {},
): Record<string, unknown> {
  const s = {
    nodes: [
      {
        id: "A",
        type: "box",
        position: { x: 0, y: 0 },
        size: { width: 40, height: 20 },
        title: "A",
        ports: [{ id: "A.out", direction: "undirected", typeKey: "k" }],
        payload: null,
      },
      {
        id: "B",
        type: "box",
        position: { x: 100, y: 0 },
        size: { width: 40, height: 20 },
        title: "B",
        ports: [{ id: "B.in", direction: "undirected", typeKey: "k" }],
        payload: null,
      },
    ] as Record<string, unknown>[],
    connections: [
      {
        id: "AB",
        from: { node: "A", port: "A.out" },
        to: { node: "B", port: "B.in" },
      },
    ] as Record<string, unknown>[],
  };
  mutate(s);
  return { format: "@paceholder/nodeeditor-js/graph", version: 1, ...s };
}

export interface Seeded {
  readonly adapter: SnapshotAdapter;
  readonly host: FakeHost;
  readonly logs: SyncLogEntry[];
}

/** An adapter on a fake host, seeded with `hostSnapshot()`. */
export function seeded(
  options: Partial<SnapshotAdapterBaseOptions> &
    SnapshotHistoryOptions &
    SnapshotCreationOptions = {},
  host: FakeHost = fakeHost(),
): Seeded {
  const logs: SyncLogEntry[] = [];
  const adapter = createSnapshotAdapter({
    idGenerator: createCounterIdGenerator(),
    onSubmit: host.onSubmit,
    onLog: (entry) => logs.push(entry),
    ...options,
  });
  const pushed = adapter.pushSnapshot(hostSnapshot());
  if (pushed.status !== "applied") throw new Error("seed push failed");
  return { adapter, host, logs };
}

export interface SeededModel {
  readonly model: SnapshotModel;
  readonly host: FakeHost;
}

/** A snapshot model on a fake host, seeded with `hostSnapshot()`. */
export function seededModel(
  options: Partial<
    Omit<SnapshotModelOptions, "history" | "nodeCreation" | "onDelegate">
  > &
    SnapshotHistoryOptions &
    SnapshotCreationOptions = {},
  host: FakeHost = fakeHost(),
): SeededModel {
  const model = createSnapshotModel({
    idGenerator: createCounterIdGenerator(),
    onSubmit: host.onSubmit,
    ...options,
  });
  const pushed = model.pushSnapshot(hostSnapshot());
  if (pushed.status !== "applied") throw new Error("seed push failed");
  return { model, host };
}

let edits = 0;

export function submission(
  adapter: SnapshotAdapter,
  patch: Patch,
  label = "Edit",
): Submission {
  edits += 1;
  return {
    operationId: operationId(`edit${edits}`),
    baseRevision: adapter.revision(),
    patch,
    label,
    history: "record",
    origin: "local",
  };
}

/** Anything with a read model: the adapter, or a model built on it. */
type Readable = { readonly reader: GraphReader };

/** A move of one node from its current position. */
export function moveOf(adapter: Readable, id: string, to: Vec2): Patch {
  const node = adapter.reader.getNode(nodeId(id));
  if (!node) throw new Error(`no node ${id}`);
  return {
    ops: [
      {
        op: "update",
        entity: "node",
        id: node.id,
        fields: { position: { old: node.position, new: to } },
      },
    ],
  };
}

/** A title change of one node. */
export function retitle(adapter: Readable, id: string, title: string): Patch {
  const node = adapter.reader.getNode(nodeId(id));
  if (!node) throw new Error(`no node ${id}`);
  return {
    ops: [
      {
        op: "update",
        entity: "node",
        id: node.id,
        fields: {
          title:
            node.title === undefined
              ? { new: title }
              : { old: node.title, new: title },
        },
      },
    ],
  };
}

export const positionOf = (adapter: Readable, id: string): Vec2 | undefined =>
  adapter.reader.getNode(nodeId(id) as NodeId)?.position;

export const titleOf = (adapter: Readable, id: string): string | undefined =>
  adapter.reader.getNode(nodeId(id))?.title;

/** Let promise callbacks run. */
export const flush = async (): Promise<void> => {
  for (let i = 0; i < 5; i += 1) await Promise.resolve();
};

/** Timers the test fires by hand. */
export function manualTimers(): VerdictTimers & {
  fire(): void;
  readonly active: () => number;
} {
  let next = 1;
  const jobs = new Map<number, () => void>();
  return {
    setTimeout(run) {
      const id = next++;
      jobs.set(id, run);
      return id;
    },
    clearTimeout(handle) {
      jobs.delete(handle as number);
    },
    fire() {
      const all = [...jobs.values()];
      jobs.clear();
      for (const run of all) run();
    },
    active: () => jobs.size,
  };
}

/** Record the events an adapter publishes from now on. */
export function watch(adapter: Pick<SnapshotAdapter, "on">) {
  const events: string[] = [];
  const changes: ChangeEvent[] = [];
  const failures: FailureEvent[] = [];
  const resyncs: ResyncRequestedEvent[] = [];
  const histories: HistoryState[] = [];
  const conflicts: ConflictEvent[] = [];
  adapter.on("conflict", (e) => {
    conflicts.push(e);
    events.push("conflict");
  });
  adapter.on("change", (e) => {
    changes.push(e);
    events.push(`change:${e.origin}`);
  });
  adapter.on("failure", (e) => failures.push(e));
  adapter.on("resync-requested", (e) => resyncs.push(e));
  adapter.on("reset", () => events.push("reset"));
  adapter.on("history", (e) => {
    histories.push(e);
    events.push("history");
  });
  return { events, changes, failures, resyncs, histories, conflicts };
}
