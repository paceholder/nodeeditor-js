import { describe, expect, it } from "vitest";
import { nodeId, operationId } from "../../base/ids/ids.js";
import { MisuseError, rejectionOf } from "../../base/result.js";
import { mkNode } from "../../data/model/test-helpers.js";
import { createLocalAdapter } from "./local-adapter.js";

const add = (adapter: { revision(): number }, id: string) =>
  ({
    operationId: operationId(`x-${id}`),
    baseRevision: adapter.revision(),
    patch: {
      ops: [{ op: "add", entity: "node", record: mkNode(id) }],
    },
    label: `Add ${id}`,
    history: "record",
    origin: "local",
  }) as const;

describe("local adapter", () => {
  it("returns the result synchronously and the reader reflects it before submit returns", () => {
    const adapter = createLocalAdapter();
    const result = adapter.submit(add(adapter, "n1"));
    const seenInside = adapter.reader.getNode(nodeId("n1"));
    expect(result).toMatchObject({
      ok: true,
      status: "accepted",
      operationId: "x-n1",
    });
    expect(seenInside).toBeDefined();
    if (result.status === "accepted")
      expect(result.changed.nodes).toEqual(["n1"]);
  });

  it("a rejected edit is a Result with a code, not an exception, and fires a failure event", () => {
    const adapter = createLocalAdapter();
    const failures: string[] = [];
    adapter.on("failure", (f) => {
      if (f.source === "rejection") failures.push(f.rejection.code);
    });
    adapter.submit(add(adapter, "n1"));
    const again = adapter.submit(add(adapter, "n1"));
    expect(again).toMatchObject({ ok: false, status: "rejected" });
    expect(failures).toEqual(["duplicate-id"]);
  });

  it("runs registered validators and supports removing them", () => {
    const adapter = createLocalAdapter();
    const off = adapter.addValidator({
      validate: () => rejectionOf("conflict", "blocked"),
    });
    expect(adapter.submit(add(adapter, "n1")).status).toBe("rejected");
    off();
    expect(adapter.submit(add(adapter, "n1")).status).toBe("accepted");
  });

  it("queues a submit made inside a handler and settles it accepted", async () => {
    const adapter = createLocalAdapter();
    const log: string[] = [];
    let inner: ReturnType<typeof adapter.submit> | undefined;
    adapter.on("change", (e) => {
      log.push(`a:${e.revision}`);
      if (!inner) inner = adapter.submit(add(adapter, "n2"));
    });
    adapter.on("change", (e) => log.push(`b:${e.revision}`));
    adapter.submit(add(adapter, "n1"));
    expect(inner?.status).toBe("queued");
    expect(log).toEqual(["a:1", "b:1", "a:2", "b:2"]);
    if (inner?.status !== "queued") throw new Error("expected queued");
    await expect(inner.settled).resolves.toMatchObject({
      ok: true,
      status: "accepted",
    });
    expect(adapter.reader.getNode(nodeId("n2"))).toBeDefined();
  });

  it("a queued submit settles as rejected when the model is disposed first", async () => {
    const adapter = createLocalAdapter();
    let inner: ReturnType<typeof adapter.submit> | undefined;
    adapter.on("change", () => {
      if (inner) return;
      inner = adapter.submit(add(adapter, "n2"));
      adapter.dispose();
    });
    adapter.submit(add(adapter, "n1"));
    if (inner?.status !== "queued") throw new Error("expected queued");
    await expect(inner.settled).resolves.toMatchObject({
      ok: false,
      status: "rejected",
      rejection: { code: "disposed" },
    });
  });

  it("external-origin changes are applied but never recorded", () => {
    const adapter = createLocalAdapter();
    adapter.submit({ ...add(adapter, "n1"), origin: "external" });
    expect(adapter.reader.getNode(nodeId("n1"))).toBeDefined();
    expect(adapter.historyState().canUndo).toBe(false);
  });

  it("advances the cursor forward only and observes added IDs", () => {
    const adapter = createLocalAdapter();
    adapter.submit({
      ...add(adapter, "n7"),
      patch: { ...add(adapter, "n7").patch, idCursor: { n: 3 } },
    });
    expect(adapter.idCursor()).toEqual({ n: 7 });
    adapter.submit({
      ...add(adapter, "n8"),
      patch: { ...add(adapter, "n8").patch, idCursor: { n: 2 } },
    });
    expect(adapter.idCursor()).toEqual({ n: 8 });
  });

  it("throws MisuseError for a malformed submission", () => {
    const adapter = createLocalAdapter();
    expect(() => adapter.submit(null as never)).toThrow(MisuseError);
  });

  it("an empty patch is accepted without an event or history entry", () => {
    const adapter = createLocalAdapter();
    let events = 0;
    adapter.on("change", () => events++);
    const r = adapter.submit({ ...add(adapter, "n1"), patch: { ops: [] } });
    expect(r.status).toBe("accepted");
    expect(events).toBe(0);
    expect(adapter.historyState().canUndo).toBe(false);
  });
});
