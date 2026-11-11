/**
 * Tool harness over a snapshot model: the same tools, scene and router as
 * `createToolHarness`, but the document belongs to a fake host. Edits show at once and wait
 * for the test's answer; the test pushes changed copies of the host's snapshot.
 */

import type { GraphModelSettings } from "../../core/graph-model.js";
import {
  createGraphModel,
  createSnapshotModel,
  exportSnapshot,
  type IdGenerator,
  type PushOutcome,
  type SnapshotModel,
} from "../../core/index.js";
import { type FakeHost, fakeHost } from "../../core/io/sync/test-kit.js";
import { graphOps } from "../../core/space/scene/scene-fixtures.js";
import {
  createToolHarness,
  type HarnessOptions,
  type ToolHarness,
} from "./tool-harness.js";

/** A pushed snapshot as plain records the test may change in place. */
export interface PlainSnapshot {
  nodes: Record<string, unknown>[];
  connections: Record<string, unknown>[];
}

export interface SnapshotToolHarness extends ToolHarness {
  readonly model: SnapshotModel;
  readonly host: FakeHost;
  /** Push the last pushed snapshot, changed by `edit` first; it becomes the last one. */
  push(edit: (snapshot: PlainSnapshot) => void): PushOutcome;
  /** Answer a submission (by its index in `host.calls`) and let the answer settle. */
  answer(index: number, status: "accepted" | "rejected"): Promise<void>;
}

/** The record with this ID in a list of a plain snapshot. */
export function recordOf(
  list: Record<string, unknown>[],
  id: string,
): Record<string, unknown> {
  const found = list.find((r) => r.id === id);
  if (!found) throw new Error(`no record ${id} in the snapshot`);
  return found;
}

/** IDs the editor issues for this one client; never a fixture ID. */
function clientIds(): IdGenerator {
  return {
    next(kind, cursor) {
      const n = Number(cursor[kind] ?? 0) + 1;
      return { id: `client-${kind}-${n}`, cursor: { ...cursor, [kind]: n } };
    },
  };
}

const settle = async (): Promise<void> => {
  for (let i = 0; i < 5; i += 1) await Promise.resolve();
};

/** `nodes` and `connections` seed the host's first snapshot. */
export function createSnapshotToolHarness(
  opts: Omit<HarnessOptions, "model" | "modelOptions"> & {
    readonly modelOptions?: GraphModelSettings;
  } = {},
): SnapshotToolHarness {
  const seed = createGraphModel(opts.modelOptions);
  const seeded = seed.submit({
    ops: graphOps(opts.nodes ?? [], opts.connections ?? []),
  });
  if (seeded.status !== "accepted") throw new Error("harness fixture rejected");
  let last: PlainSnapshot & Record<string, unknown> = JSON.parse(
    JSON.stringify(exportSnapshot(seed)),
  );
  seed.dispose();
  const host = fakeHost();
  const model = createSnapshotModel({
    ...opts.modelOptions,
    idGenerator: clientIds(),
    onSubmit: host.onSubmit,
  });
  const first = model.pushSnapshot(last);
  if (first.status !== "applied") throw new Error("harness seed push failed");
  const { nodes: _n, connections: _c, modelOptions: _m, ...rest } = opts;
  const harness = createToolHarness({ ...rest, model });
  return {
    ...harness,
    model,
    host,
    push(edit) {
      const next = JSON.parse(JSON.stringify(last));
      edit(next);
      last = next;
      const outcome = model.pushSnapshot(next);
      if (outcome.status === "queued") throw new Error("push was queued");
      return outcome;
    },
    async answer(index, status) {
      const call = host.calls[index];
      if (!call) throw new Error(`no submission ${index}`);
      host.answer(
        call.operationId,
        status === "accepted"
          ? { status }
          : {
              status,
              rejection: {
                code: "conflict",
                message: "The host refused the edit",
                entities: [],
              },
            },
      );
      await settle();
    },
  };
}
