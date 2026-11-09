/// <reference types="@vitest/browser-playwright" />
import { describe, expect, it } from "vitest";
import {
  type ExecuteResult,
  exportSnapshot,
  loadSnapshot,
  nodeId,
  type OperationId,
  rejectionOf,
} from "../core/index.js";
import { buildModel, twoPortNode } from "../core/space/scene/scene-fixtures.js";
import { cleanupScope, frames, makeHost } from "./browser-support.js";
import type {
  ConnectionRejectedEvent,
  GestureCancelledEvent,
} from "./index.js";
import { mouse } from "./interact/input/input-test-support.js";
import { mountView } from "./mount-view.js";

const cleanup = cleanupScope();

function setup(wrap?: (model: ReturnType<typeof buildModel>) => never) {
  const model = buildModel([
    twoPortNode("a", 100, 100, { w: 60, h: 40 }),
    twoPortNode("b", 300, 100, { w: 60, h: 40 }),
    twoPortNode("c", 300, 220, { w: 60, h: 40 }),
  ]);
  const view = mountView(makeHost(500, 320), {
    model: wrap ? wrap(model) : model,
    input: { platform: "other" },
  });
  cleanup(() => view.dispose());
  const cancelled: GestureCancelledEvent[] = [];
  const rejected: ConnectionRejectedEvent[] = [];
  view.on("gesture-cancelled", (e) => cancelled.push(e));
  view.on("connection-rejected", (e) => rejected.push(e));
  const position = (id: string) => model.reader.getNode(nodeId(id))?.position;
  return { model, view, cancelled, rejected, position, pointer: mouse(view) };
}

describe("gesture-cancelled", () => {
  it("removing the dragged node cancels the drag and names it", async () => {
    const { model, cancelled, pointer } = setup();
    await frames();
    pointer.down(100, 100);
    pointer.move(130, 130);
    model.execute({ kind: "deleteEntities", nodes: [nodeId("a")] });
    pointer.move(160, 150);
    pointer.up(160, 150);
    await frames();
    expect(cancelled).toEqual([{ reason: "entity-removed", ids: ["a"] }]);
    expect(model.reader.nodes()).toHaveLength(2);
  });

  it("removing an unrelated node leaves the drag running and silent", async () => {
    const { model, cancelled, position, pointer } = setup();
    await frames();
    const start = position("a");
    pointer.down(100, 100);
    pointer.move(130, 130);
    model.execute({ kind: "deleteEntities", nodes: [nodeId("c")] });
    pointer.move(160, 150);
    pointer.up(160, 150);
    await frames();
    expect(cancelled).toEqual([]);
    expect(position("a")).not.toEqual(start);
  });

  it("locking during a drag reports the lock; locking when idle reports nothing", async () => {
    const { view, cancelled, pointer } = setup();
    await frames();
    view.setLocked(true);
    view.setLocked(false);
    expect(cancelled).toEqual([]);
    pointer.down(100, 100);
    pointer.move(130, 130);
    view.setLocked(true);
    expect(cancelled).toEqual([{ reason: "locked", ids: [] }]);
  });

  it("replacing the document during a drag reports a reset", async () => {
    const { model, cancelled, pointer } = setup();
    await frames();
    const saved = exportSnapshot(model);
    pointer.down(100, 100);
    pointer.move(130, 130);
    expect(loadSnapshot(model, saved).ok).toBe(true);
    pointer.up(130, 130);
    await frames();
    expect(cancelled).toEqual([{ reason: "reset", ids: [] }]);
  });
});

describe("connection-rejected", () => {
  it("a commit the model refuses during a drag is reported with source gesture", async () => {
    const refusal = rejectionOf("capacity-exhausted", "The host says no", [
      "aR",
      "bL",
    ]);
    const { model, rejected, pointer } = setup(
      (m) =>
        Object.assign(Object.create(m), {
          execute(command: Parameters<typeof m.execute>[0]): ExecuteResult {
            return command.kind === "connect"
              ? {
                  ok: false,
                  status: "rejected",
                  operationId: "op-test" as OperationId,
                  rejection: refusal,
                }
              : m.execute(command);
          },
        }) as never,
    );
    await frames();
    // From the right port of a to the left port of b.
    pointer.drag([130, 100], [270, 100]);
    await frames();
    expect(rejected).toEqual([{ rejection: refusal, source: "gesture" }]);
    expect(model.reader.connections()).toHaveLength(0);
  });
});
