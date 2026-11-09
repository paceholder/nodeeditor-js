/// <reference types="@vitest/browser-playwright" />
import { describe, expect, it } from "vitest";
import {
  type ConnectionPolicy,
  type ConnectionValidator,
  type ConnectionVerdict,
  createDefaultConnectionPolicy,
  createGraphModel,
  type GraphModel,
  nodeId,
  rejectionOf,
  type VerdictRequest,
} from "../core/index.js";
import { graphOps, twoPortNode } from "../core/space/scene/scene-fixtures.js";
import { cleanupScope, frames, makeHost } from "./browser-support.js";
import type {
  ConnectionRejectedEvent,
  GestureCancelledEvent,
} from "./index.js";
import { key, mouse } from "./interact/input/input-test-support.js";
import { mountView } from "./mount-view.js";

const cleanup = cleanupScope();
const settle = () => new Promise((r) => setTimeout(r, 0));

/** A host validator the test answers by hand. */
function slowValidator() {
  const calls: Array<
    VerdictRequest & {
      answer(verdict: ConnectionVerdict): Promise<void>;
      fail(error: Error): Promise<void>;
    }
  > = [];
  const validator: ConnectionValidator = (request) =>
    new Promise((resolve, reject) => {
      calls.push({
        ...request,
        answer: async (verdict) => {
          resolve(verdict);
          await settle();
        },
        fail: async (error) => {
          reject(error);
          await settle();
        },
      });
    });
  return { validator, calls };
}

function setup(views = 1) {
  const { validator, calls } = slowValidator();
  const model = createGraphModel({ connectionValidator: validator });
  model.submit(
    {
      ops: graphOps(
        [
          twoPortNode("a", 100, 100, { w: 60, h: 40 }),
          twoPortNode("b", 300, 100, { w: 60, h: 40 }),
        ],
        [],
      ),
    },
    { history: "skip" },
  );
  const mounted = Array.from({ length: views }, () => {
    const view = mountView(makeHost(500, 300), {
      model,
      input: { platform: "other" },
    });
    cleanup(() => view.dispose());
    const rejected: ConnectionRejectedEvent[] = [];
    const cancelled: GestureCancelledEvent[] = [];
    view.on("connection-rejected", (e) => rejected.push(e));
    view.on("gesture-cancelled", (e) => cancelled.push(e));
    return { view, rejected, cancelled, pointer: mouse(view) };
  });
  const [first, second] = mounted as [Mounted, Mounted];
  return { model, calls, mounted, first, second };
}

type Mounted = {
  view: ReturnType<typeof mountView>;
  rejected: ConnectionRejectedEvent[];
  cancelled: GestureCancelledEvent[];
  pointer: ReturnType<typeof mouse>;
};

// From the right port of a (130, 100) to the left port of b (270, 100).
const FROM = [130, 100] as const;
const TO = [270, 100] as const;

function dragTo(pointer: ReturnType<typeof mouse>, release = true) {
  pointer.down(...FROM);
  for (let i = 1; i <= 6; i++) {
    pointer.move(
      FROM[0] + ((TO[0] - FROM[0]) * i) / 6,
      FROM[1] + ((TO[1] - FROM[1]) * i) / 6,
    );
  }
  if (release) pointer.up(...TO);
}

describe("pending target resolution in a mounted view", () => {
  it("the drag asks the host once, and an accepted verdict lets the release connect without moving the pointer", async () => {
    const { model, calls, first } = setup();
    const { pointer } = first;
    await frames();
    dragTo(pointer, false);
    expect(calls).toHaveLength(1);
    await calls[0]?.answer({ valid: true });
    // No pointer movement since the verdict: the release finds the target compatible.
    pointer.up(...TO);
    await frames();
    expect(model.reader.connections()).toHaveLength(1);
    expect(calls).toHaveLength(1);
    // One undo removes the created connection.
    expect(model.historyState().canUndo).toBe(true);
    model.undo();
    expect(model.reader.connections()).toHaveLength(0);
  });

  it("the pending cue is painted, and the verdict repaints the target without a pointer move", async () => {
    const { calls, first } = setup();
    await frames();
    const canvas = first.view.canvases.interaction;
    const snapshot = () =>
      canvas.getContext("2d")?.getImageData(0, 0, canvas.width, canvas.height)
        .data;
    dragTo(first.pointer, false);
    await frames(3);
    const pending = snapshot();
    expect(pending?.some((v) => v !== 0)).toBe(true);
    await calls[0]?.answer({ valid: true });
    await frames(3);
    const compatible = snapshot();
    expect(compatible?.some((v) => v !== 0)).toBe(true);
    expect(pending?.some((v, i) => v !== compatible?.[i])).toBe(true);
    first.pointer.up(...TO);
  });

  it("releasing while pending commits nothing until the verdict, then connects once", async () => {
    const { model, calls, first } = setup();
    const { pointer } = first;
    await frames();
    dragTo(pointer);
    await frames();
    expect(model.reader.connections()).toHaveLength(0);
    await calls[0]?.answer({ valid: true });
    await frames();
    expect(model.reader.connections()).toHaveLength(1);
    expect(model.historyState().undoLabel).toBeDefined();
  });

  it("a refused verdict commits nothing and the host event carries its code and message", async () => {
    const { model, calls, first } = setup();
    const { pointer, rejected } = first;
    await frames();
    dragTo(pointer);
    await calls[0]?.answer({
      valid: false,
      rejection: rejectionOf("type-mismatch", "Signals do not mix here", [
        "aR",
        "bL",
      ]),
    });
    await frames();
    expect(model.reader.connections()).toHaveLength(0);
    expect(rejected).toHaveLength(1);
    expect(rejected[0]?.source).toBe("gesture");
    expect(rejected[0]?.rejection).toMatchObject({
      code: "type-mismatch",
      message: "Signals do not mix here",
    });
  });

  it("panning works while a verdict is pending: a press elsewhere cancels the wait", async () => {
    const { model, calls, first } = setup();
    const { view, pointer } = first;
    await frames();
    dragTo(pointer);
    const before = view.viewport.get().panX;
    pointer.drag([200, 250], [240, 270]);
    await frames();
    expect(view.viewport.get().panX).not.toBe(before);
    expect(calls[0]?.signal.aborted).toBe(true);
    await calls[0]?.answer({ valid: true });
    await frames();
    expect(model.reader.connections()).toHaveLength(0);
  });

  it("locking the view during the wait cancels it, names the lock and ignores a later verdict", async () => {
    const { model, calls, first } = setup();
    const { view, pointer, cancelled } = first;
    await frames();
    dragTo(pointer);
    view.setLocked(true);
    expect(cancelled).toEqual([{ reason: "locked", ids: [] }]);
    expect(calls[0]?.signal.aborted).toBe(true);
    await calls[0]?.answer({ valid: true });
    await frames();
    expect(model.reader.connections()).toHaveLength(0);
  });

  it("a view ending its gesture forgets only its own failures: another view still shows the refusal", async () => {
    const { model, calls, first, second } = setup(2);
    await frames();
    dragTo(first.pointer);
    dragTo(second.pointer, false);
    expect(calls).toHaveLength(1);
    await calls[0]?.fail(new Error("host down"));
    key(first.view.element, "Escape");
    // The second view keeps the failure it is showing, and asks nobody again.
    second.pointer.up(...TO);
    await frames();
    expect(calls).toHaveLength(1);
    expect(second.rejected.map((e) => e.rejection.code)).toEqual([
      "validator-failed",
    ]);
    expect(model.reader.connections()).toHaveLength(0);
    // Once it has ended its own gesture the failure is gone for good.
    dragTo(second.pointer, false);
    expect(calls).toHaveLength(2);
    key(second.view.element, "Escape");
  });

  it("two views on one model share one request, and disposing one keeps it for the other", async () => {
    const { model, calls, first, second } = setup(2);
    await frames();
    dragTo(first.pointer);
    dragTo(second.pointer);
    expect(calls).toHaveLength(1);
    first.view.dispose();
    expect(calls[0]?.signal.aborted).toBe(false);
    await calls[0]?.answer({ valid: true });
    await frames();
    expect(model.reader.connections()).toHaveLength(1);
  });
});

/** The default policy, but any connection into `b` may be "fast" or "slow". */
function twoKinds(): ConnectionPolicy {
  const base = createDefaultConnectionPolicy();
  return {
    evaluate(proposal, graph) {
      const outcome = base.evaluate(proposal, graph);
      if (outcome.kind !== "accept") return outcome;
      const kind = proposal.choice ?? proposal.kind;
      if (kind !== undefined) {
        return {
          kind: "accept",
          plan: { ...outcome.plan, connectionKind: kind },
        };
      }
      return {
        kind: "choice",
        alternatives: ["fast", "slow"].map((k) => ({
          ...outcome.plan,
          connectionKind: k,
          key: k,
        })),
      };
    },
  };
}

/**
 * The view sees the model's changes as external while `asExternal` runs, the way a host
 * adapter reports edits made by someone else.
 */
function viewedAsExternal(model: GraphModel) {
  let external = false;
  const on = (type: string, handler: (event: never) => void) =>
    model.on(
      type as "change",
      type === "change"
        ? (event) =>
            handler(
              (external ? { ...event, origin: "external" } : event) as never,
            )
        : (handler as never),
    );
  return {
    seen: Object.assign(Object.create(model), { on }) as GraphModel,
    asExternal<T>(change: () => T): T {
      external = true;
      try {
        return change();
      } finally {
        external = false;
      }
    },
  };
}

function choiceSetup() {
  const { validator, calls } = slowValidator();
  const model = createGraphModel({
    connectionPolicy: twoKinds(),
    connectionValidator: validator,
  });
  model.submit(
    {
      ops: graphOps(
        [
          twoPortNode("a", 100, 100, { w: 60, h: 40 }),
          twoPortNode("b", 300, 100, { w: 60, h: 40 }),
          twoPortNode("c", 300, 220, { w: 60, h: 40 }),
        ],
        [],
      ),
    },
    { history: "skip" },
  );
  const { seen, asExternal } = viewedAsExternal(model);
  const view = mountView(makeHost(500, 300), {
    model: seen,
    // The host picks "slow" at once; the picked alternative is what the validator judges.
    input: { platform: "other", chooseConnection: () => "slow" },
  });
  cleanup(() => view.dispose());
  const rejected: ConnectionRejectedEvent[] = [];
  const cancelled: GestureCancelledEvent[] = [];
  view.on("connection-rejected", (e) => rejected.push(e));
  view.on("gesture-cancelled", (e) => cancelled.push(e));
  const moveNode = (id: string, x: number, y: number) =>
    model.execute({
      kind: "moveNodes",
      moves: [{ node: nodeId(id), position: { x, y } }],
    });
  return {
    model,
    calls,
    view,
    rejected,
    cancelled,
    asExternal,
    moveNode,
    pointer: mouse(view),
  };
}

describe("a picked alternative is judged by the host validator", () => {
  it("the pick asks for the verdict of the picked kind, shows pending, and an accepted verdict creates the wire once", async () => {
    const { model, calls, pointer } = choiceSetup();
    await frames();
    dragTo(pointer);
    await frames();
    expect(calls).toHaveLength(1);
    expect(calls[0]?.proposal.kind).toBe("slow");
    expect(model.reader.connections()).toHaveLength(0);
    await calls[0]?.answer({ valid: true });
    await frames();
    const [wire] = model.reader.connections();
    expect(model.reader.connections()).toHaveLength(1);
    expect(wire?.kind).toBe("slow");
    model.undo();
    expect(model.reader.connections()).toHaveLength(0);
  });

  it("a refused verdict creates nothing and reaches the host as connection-rejected", async () => {
    const { model, calls, pointer, rejected } = choiceSetup();
    await frames();
    dragTo(pointer);
    await calls[0]?.answer({
      valid: false,
      rejection: rejectionOf("type-mismatch", "Slow links do not fit here", [
        "aR",
        "bL",
      ]),
    });
    await frames();
    expect(model.reader.connections()).toHaveLength(0);
    expect(rejected).toHaveLength(1);
    expect(rejected[0]?.source).toBe("gesture");
    expect(rejected[0]?.rejection).toMatchObject({
      code: "type-mismatch",
      message: "Slow links do not fit here",
    });
  });

  it("Escape while the picked alternative waits aborts the request and ignores a later verdict", async () => {
    const { model, calls, view, pointer, rejected } = choiceSetup();
    await frames();
    dragTo(pointer);
    expect(calls[0]?.signal.aborted).toBe(false);
    key(view.element, "Escape");
    expect(calls[0]?.signal.aborted).toBe(true);
    await calls[0]?.answer({ valid: true });
    await frames();
    expect(model.reader.connections()).toHaveLength(0);
    expect(rejected).toHaveLength(0);
  });

  it("a press elsewhere and locking the view during the wait each cancel it", async () => {
    for (const cancel of [
      (c: ReturnType<typeof choiceSetup>) => c.pointer.down(250, 250),
      (c: ReturnType<typeof choiceSetup>) => c.view.setLocked(true),
    ]) {
      const c = choiceSetup();
      await frames();
      dragTo(c.pointer);
      cancel(c);
      expect(c.calls[0]?.signal.aborted).toBe(true);
      await c.calls[0]?.answer({ valid: true });
      await frames();
      expect(c.model.reader.connections()).toHaveLength(0);
    }
  });
});

describe("a picked alternative waiting for its verdict follows the cancellation rules of a gesture", () => {
  it("an external change of an involved node cancels the wait, aborts the request, tells the host and ignores a later verdict", async () => {
    const c = choiceSetup();
    await frames();
    dragTo(c.pointer);
    expect(c.calls[0]?.signal.aborted).toBe(false);
    c.asExternal(() => c.moveNode("b", 310, 100));
    expect(c.calls[0]?.signal.aborted).toBe(true);
    expect(c.cancelled).toEqual([{ reason: "external-change", ids: ["b"] }]);
    await c.calls[0]?.answer({ valid: true });
    await frames();
    expect(c.model.reader.connections()).toHaveLength(0);
  });

  it("removing an involved node, from any origin, cancels the wait and names what was removed", async () => {
    const c = choiceSetup();
    await frames();
    dragTo(c.pointer);
    c.model.execute({ kind: "deleteEntities", nodes: [nodeId("b")] });
    expect(c.calls[0]?.signal.aborted).toBe(true);
    expect(c.cancelled).toHaveLength(1);
    expect(c.cancelled[0]?.reason).toBe("entity-removed");
    expect(c.cancelled[0]?.ids).toContain("b");
    await c.calls[0]?.answer({ valid: true });
    await frames();
    expect(c.model.reader.connections()).toHaveLength(0);
  });

  it("a local change of an involved node or an external change of another one keeps the wait, and its own commit does not cancel it", async () => {
    const c = choiceSetup();
    await frames();
    dragTo(c.pointer);
    c.moveNode("b", 310, 100);
    c.asExternal(() => c.moveNode("c", 310, 220));
    expect(c.calls[0]?.signal.aborted).toBe(false);
    expect(c.cancelled).toEqual([]);
    // The move made the first answer stale: it is asked for once more, and that one counts.
    await c.calls[0]?.answer({ valid: true });
    expect(c.calls).toHaveLength(2);
    await c.calls[1]?.answer({ valid: true });
    await frames();
    expect(c.model.reader.connections()).toHaveLength(1);
    expect(c.cancelled).toEqual([]);
  });
});
