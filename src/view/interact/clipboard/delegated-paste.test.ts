import { describe, expect, it } from "vitest";
import { exportSnapshot, nodeId, rejectionOf } from "../../../core/index.js";
import {
  boxRegistry,
  fakeCreator,
  flush,
  seededModel,
} from "../../../core/io/sync/test-kit.js";
import { nodeKey } from "../selection/selection-model.js";
import { clipboardSetup } from "./clipboard-fixtures.js";
import type { PasteOutcome } from "./clipboard-types.js";

/** Nodes A and B of a host-owned document whose host names new nodes, both selected. */
function delegating() {
  const creator = fakeCreator();
  const { model, host } = seededModel({
    registry: boxRegistry(),
    nodeCreation: "delegated",
    onDelegate: creator.onDelegate,
  });
  const s = clipboardSetup({ model });
  s.selection.replace([nodeKey(nodeId("A")), nodeKey(nodeId("B"))]);
  const reports: PasteOutcome[] = [];
  s.service.on("paste", (e) => reports.push(e));
  return { ...s, model, host, creator, reports };
}

/** The host's own refusal, with a message the library must not change. */
const refusal = rejectionOf(
  "unsupported-command",
  "This store cannot create several records in one call",
);

describe("paste, duplicate and unavailable creation: the host refuses a fragment", () => {
  it("a refused duplicate settles rejected, the view reports the host's message unchanged, and nothing is created", async () => {
    const { model, host, creator, reports, service } = delegating();
    const before = exportSnapshot(model);
    const outcome = service.duplicate();
    expect(outcome).toEqual({
      ok: true,
      value: {
        status: "pending",
        created: { nodes: [], ports: [], connections: [] },
        excluded: [],
      },
    });
    expect(creator.intents).toHaveLength(1);
    expect(creator.intents[0]?.kind).toBe("create-fragment");
    expect(model.placeholders()).toHaveLength(2);
    creator.answer(creator.intents[0]?.operationId ?? "", {
      status: "rejected",
      rejection: refusal,
    });
    await flush();
    // Validation identity: the view's report carries the host's rejection as it was.
    expect(reports).toEqual([outcome, { ok: false, rejection: refusal }]);
    const last = reports[1];
    expect(last && !last.ok && last.rejection.message).toBe(refusal.message);
    expect(exportSnapshot(model)).toEqual(before);
    expect(model.placeholders()).toEqual([]);
    expect(model.pendingEdits()).toEqual([]);
    expect(host.calls).toEqual([]);
  });

  it("a refused paste of copied nodes is reported the same way", async () => {
    const { model, creator, reports, service } = delegating();
    expect(service.copy().ok).toBe(true);
    const outcome = service.paste();
    expect(outcome.ok && outcome.value.status).toBe("pending");
    creator.answer(creator.intents[0]?.operationId ?? "", {
      status: "rejected",
      rejection: refusal,
    });
    await flush();
    expect(reports).toEqual([outcome, { ok: false, rejection: refusal }]);
    expect(model.reader.nodes()).toHaveLength(2);
  });

  it("an accepted fragment adds no second report; its nodes arrive with a push", async () => {
    const { creator, reports, service } = delegating();
    const outcome = service.duplicate();
    creator.answer(creator.intents[0]?.operationId ?? "", {
      status: "accepted",
    });
    await flush();
    expect(reports).toEqual([outcome]);
  });

  it("an accepted fragment keeps the user's selection, since nothing it created is known yet", async () => {
    const { creator, selection, service } = delegating();
    const before = [...selection.keys()];
    service.duplicate();
    creator.answer(creator.intents[0]?.operationId ?? "", {
      status: "accepted",
    });
    await flush();
    expect([...selection.keys()]).toEqual(before);
    expect(before).toHaveLength(2);
  });
});
