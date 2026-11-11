/// <reference types="@vitest/browser-playwright" />
import { describe, expect, it } from "vitest";
import {
  createGraphModel,
  createSnapshotModel,
  exportSnapshot,
  type IdGenerator,
  nodeId,
} from "../core/index.js";
import { fakeHost } from "../core/io/sync/test-kit.js";
import { graphOps, twoPortNode } from "../core/space/scene/scene-fixtures.js";
import { cleanupScope, frames, makeHost } from "./browser-support.js";
import type { GestureCancelledEvent } from "./index.js";
import { mouse } from "./interact/input/input-test-support.js";
import { mountView } from "./mount-view.js";

const cleanup = cleanupScope();

interface Plain {
  nodes: Record<string, unknown>[];
  connections: Record<string, unknown>[];
}

const clientIds = (): IdGenerator => ({
  next(kind, cursor) {
    const n = Number(cursor[kind] ?? 0) + 1;
    return { id: `client-${kind}-${n}`, cursor: { ...cursor, [kind]: n } };
  },
});

/** A host-owned document of three nodes mounted in a view. */
function setup() {
  const seed = createGraphModel();
  seed.submit({
    ops: graphOps([
      twoPortNode("a", 100, 100, { w: 60, h: 40 }),
      twoPortNode("b", 300, 100, { w: 60, h: 40 }),
      twoPortNode("c", 300, 220, { w: 60, h: 40 }),
    ]),
  });
  let last: Plain = JSON.parse(JSON.stringify(exportSnapshot(seed)));
  seed.dispose();
  const host = fakeHost();
  const model = createSnapshotModel({
    idGenerator: clientIds(),
    onSubmit: host.onSubmit,
  });
  model.pushSnapshot(last);
  const view = mountView(makeHost(500, 320), {
    model,
    input: { platform: "other" },
  });
  cleanup(() => view.dispose());
  const cancelled: GestureCancelledEvent[] = [];
  view.on("gesture-cancelled", (e) => cancelled.push(e));
  /** Push the last pushed snapshot changed by `edit`. */
  const push = (edit: (s: Plain) => void) => {
    const next: Plain = JSON.parse(JSON.stringify(last));
    edit(next);
    last = next;
    const outcome = model.pushSnapshot(next);
    expect(outcome.status).toBe("applied");
  };
  const retitle = (id: string, title: string) => (s: Plain) => {
    const node = s.nodes.find((n) => n.id === id);
    if (node) node.title = title;
  };
  const position = (id: string) => model.reader.getNode(nodeId(id))?.position;
  return {
    model,
    view,
    host,
    cancelled,
    push,
    retitle,
    position,
    pointer: mouse(view),
  };
}

describe("a snapshot push is an incremental external change in a mounted view", () => {
  it("gestures survive unrelated pushes: selection, viewport and a drag of another node are kept", async () => {
    const { model, view, host, cancelled, push, retitle, position, pointer } =
      setup();
    await frames();
    view.selection.replace([{ kind: "node", id: nodeId("a") }]);
    view.viewport.set({ zoom: 1.25, panX: -20, panY: 10 });
    await frames();
    push(retitle("c", "Pushed once"));
    await frames();
    expect(view.selection.nodes()).toEqual([nodeId("a")]);
    expect(view.viewport.get()).toEqual({ zoom: 1.25, panX: -20, panY: 10 });
    // Pushes are not undo entries.
    expect(model.historyState().canUndo).toBe(false);

    const start = position("b");
    pointer.down(300, 100);
    pointer.move(330, 130);
    push(retitle("c", "Pushed twice"));
    pointer.move(360, 150);
    pointer.up(360, 150);
    await frames();
    expect(cancelled).toEqual([]);
    expect(model.reader.getNode(nodeId("c"))?.title).toBe("Pushed twice");
    expect(host.calls).toHaveLength(1);
    expect(host.calls[0]?.patch.ops).toEqual([
      expect.objectContaining({ op: "update", entity: "node", id: "b" }),
    ]);
    expect(position("b")).toEqual({
      x: (start?.x ?? 0) + 60,
      y: (start?.y ?? 0) + 50,
    });
    expect(view.viewport.get()).toEqual({ zoom: 1.25, panX: -20, panY: 10 });
    // The release is the only undo entry: it waits for the host, then is available.
    expect(model.historyState().undoCode).toBe("edit-pending");
    const operation = host.calls[0]?.operationId ?? "";
    host.answer(operation, { status: "accepted" });
    await frames();
    expect(model.pendingEdits()).toEqual([]);
    expect(model.historyState().canUndo).toBe(true);
  });

  it("a push removing the dragged node cancels the drag with a gesture-cancelled event", async () => {
    const { model, host, cancelled, push, pointer } = setup();
    await frames();
    pointer.down(300, 100);
    pointer.move(330, 130);
    push((s) => {
      s.nodes = s.nodes.filter((n) => n.id !== "b");
    });
    pointer.move(360, 150);
    pointer.up(360, 150);
    await frames();
    expect(cancelled).toEqual([{ reason: "entity-removed", ids: ["b"] }]);
    expect(host.calls).toEqual([]);
    expect(model.reader.nodes()).toHaveLength(2);
    expect(model.historyState().canUndo).toBe(false);
  });
});
