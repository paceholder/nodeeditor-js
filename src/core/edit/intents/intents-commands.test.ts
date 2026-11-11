import { describe, expect, it } from "vitest";
import type { Patch } from "../../data/patch/types.js";
import type { GraphModel } from "../../graph-model.js";
import { end, firstConnection, make } from "../commands/test-kit.js";
import type { Command } from "../commands/types.js";
import { decodeIntents } from "./decode.js";
import type { IntentKind } from "./intent-types.js";
import { claimedKeys, intentModel, opKeys, submissionFor } from "./test-kit.js";

/** Three tanks, a-b connected, with a pinned route on the connection. */
function scene() {
  const model = intentModel();
  const a = make(model, "tank", 0, 0);
  const b = make(model, "tank", 100, 0);
  const c = make(model, "tank", 200, 0);
  model.connect(end(a, 1), end(b, 0));
  return { model, a, b, c, connection: firstConnection(model) };
}

/**
 * Plan the command, run it, and return the decoded kinds of the one change it made,
 * after checking that the change carries the planned patch and the history label.
 */
function runAndDecode(model: GraphModel, command: Command): IntentKind[] {
  const planned = model.plan(command);
  if (planned.kind !== "ready") throw new Error(JSON.stringify(planned));
  const patches: Patch[] = [];
  const off = model.on("change", (event) => patches.push(event.patch));
  const before = model.revision();
  const decoded = decodeIntents(
    submissionFor(model, planned.patch, planned.label),
    model.reader,
  );
  expect(model.execute(command).status).toBe("accepted");
  off();
  expect(patches, "one submission per command").toHaveLength(1);
  expect(model.revision()).toBe(before + 1);
  expect(model.historyState().undoLabel, "label untouched").toBe(planned.label);
  expect(claimedKeys(decoded)).toEqual(opKeys(patches[0] ?? { ops: [] }));
  return decoded.map((i) => i.kind);
}

describe("submission intent decoding against the real commands, under the local undo and redo rule", () => {
  it("decodes each real command's single submission to its named intent", () => {
    const { model, a, b, c, connection } = scene();
    model.execute({
      kind: "setRoute",
      connection,
      route: [{ kind: "segment", orientation: "vertical", at: 50 }],
    });
    expect(
      runAndDecode(model, {
        kind: "moveNodes",
        moves: [
          { node: a.node, position: { x: 5, y: 5 } },
          { node: b.node, position: { x: 105, y: 5 } },
        ],
      }),
    ).toEqual(["move"]);
    expect(
      runAndDecode(model, { kind: "rotateNodes", nodes: [c.node], turns: 1 }),
    ).toEqual(["rotate"]);
    expect(
      runAndDecode(model, { kind: "mirrorNodes", nodes: [c.node] }),
    ).toEqual(["mirror"]);
    expect(
      runAndDecode(model, {
        kind: "resizeNode",
        node: c.node,
        size: { width: 80, height: 20 },
        fixed: { x: 1, y: 1 },
      }),
    ).toEqual(["resize"]);
    expect(
      runAndDecode(model, { kind: "connect", from: end(b, 1), to: end(c, 0) }),
    ).toEqual(["connect"]);
    expect(
      runAndDecode(model, {
        kind: "reconnect",
        connection,
        end: "to",
        target: end(c, 1),
      }),
    ).toEqual(["reconnect"]);
    expect(
      runAndDecode(model, { kind: "deleteEntities", nodes: [c.node] }),
    ).toEqual(["delete"]);
    expect(model.undo().status).toBe("accepted");
    expect(model.historyState().redoLabel).toBe("Delete");
  });

  it("decodes a reconnect command to one reconnect naming the same connection with old and new endpoints", () => {
    const { model, b, c, connection } = scene();
    const planned = model.plan({
      kind: "reconnect",
      connection,
      end: "to",
      target: end(c, 0),
    });
    if (planned.kind !== "ready") throw new Error(JSON.stringify(planned));
    expect(
      decodeIntents(submissionFor(model, planned.patch), model.reader),
    ).toEqual([
      {
        kind: "reconnect",
        connection,
        to: { old: end(b, 0), new: end(c, 0) },
      },
    ]);
  });

  it("decodes a deleteEntities plus a connect in one patch to a delete and a connect, never a reconnect", () => {
    const { model, a, b, c } = scene();
    const removal = model.plan({ kind: "deleteEntities", nodes: [b.node] });
    const addition = model.plan({
      kind: "connect",
      from: end(a, 1),
      to: end(c, 0),
    });
    if (removal.kind !== "ready" || addition.kind !== "ready")
      throw new Error("did not plan");
    const patch = { ops: [...removal.patch.ops, ...addition.patch.ops] };
    const kinds = decodeIntents(submissionFor(model, patch), model.reader).map(
      (i) => i.kind,
    );
    expect(kinds).toEqual(["delete", "connect"]);
  });

  it("decodes a connection delete plus a connect between the same nodes to a disconnect and a connect, never a reconnect", () => {
    const { model, a, b, connection } = scene();
    const removal = model.plan({
      kind: "deleteEntities",
      connections: [connection],
    });
    const addition = model.plan({
      kind: "connect",
      from: end(a, 1),
      to: end(b, 1),
    });
    if (removal.kind !== "ready" || addition.kind !== "ready")
      throw new Error("did not plan");
    const patch = { ops: [...removal.patch.ops, ...addition.patch.ops] };
    const kinds = decodeIntents(submissionFor(model, patch), model.reader).map(
      (i) => i.kind,
    );
    expect(kinds).toEqual(["disconnect", "connect"]);
  });
});
