import { afterEach, describe, expect, it, vi } from "vitest";
import { nodeId, portId } from "../../base/ids/ids.js";
import { toRevision } from "../adapter/types.js";
import type { TouchedEntities } from "./touched-entities.js";
import type { ConnectionPlan } from "./types.js";
import { createVerdictCache } from "./verdict-cache.js";
import type { ConnectionVerdict, VerdictRequest } from "./verdict-types.js";

const plan = (a: string, b: string, kind = "default"): ConnectionPlan => ({
  from: { node: nodeId(`n-${a}`), port: portId(a) },
  to: { node: nodeId(`n-${b}`), port: portId(b) },
  connectionKind: kind,
  auxiliary: [],
});

const touching = (ports: string[], nodes: string[] = []): TouchedEntities => ({
  ports: new Set(ports),
  nodes: new Set(nodes),
});

const valid: ConnectionVerdict = { valid: true };
const invalid: ConnectionVerdict = {
  valid: false,
  reason: { code: "type-mismatch", message: "No", entities: [] },
};

const flush = async () => {
  for (let i = 0; i < 6; i++) await Promise.resolve();
};

/** A validator whose answers the test controls, one request at a time. */
function fakeValidator() {
  const calls: {
    request: VerdictRequest;
    answer(reply: unknown): void;
    fail(error: unknown): void;
  }[] = [];
  const validator = (request: VerdictRequest) =>
    new Promise<ConnectionVerdict>((resolve, reject) => {
      calls.push({
        request,
        answer: (reply) => resolve(reply as ConnectionVerdict),
        fail: reject,
      });
    });
  return { validator, calls };
}

function setup(options: { timeoutMs?: number; capacity?: number } = {}) {
  const fake = fakeValidator();
  const cache = createVerdictCache({
    validator: fake.validator,
    revision: () => toRevision("r1"),
    ...options,
  });
  return { ...fake, cache };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("verdict cache requests", () => {
  it("makes one validator call for 50 requests of one key", async () => {
    const { cache, calls } = setup();
    const p = plan("a", "b");
    const answers = Array.from({ length: 50 }, () => cache.request(p));
    expect(calls).toHaveLength(1);
    expect(cache.lookup(p).kind).toBe("pending");
    calls[0]?.answer(valid);
    expect(await Promise.all(answers)).toEqual(Array(50).fill(valid));
    expect(cache.lookup(p)).toEqual({ kind: "valid" });
    await cache.request(p);
    expect(calls).toHaveLength(1);
  });

  it("sends the normalized proposal and the revision token", () => {
    const { cache, calls } = setup();
    void cache.request(plan("a", "b", "flow"));
    expect(calls[0]?.request.proposal).toEqual({
      from: { node: "n-a", port: "a" },
      to: { node: "n-b", port: "b" },
      kind: "flow",
    });
    expect(calls[0]?.request.revision).toBe("r1");
  });

  it("stores a late verdict under its own key and leaves the other pending", async () => {
    const { cache, calls } = setup();
    const first = plan("a", "b");
    const second = plan("c", "d");
    void cache.request(first);
    void cache.request(second);
    calls[1]?.answer(invalid);
    await flush();
    expect(cache.lookup(first).kind).toBe("pending");
    expect(cache.lookup(second).kind).toBe("invalid");
  });

  it("reports a rejection verdict with its structured reason", async () => {
    const { cache, calls } = setup();
    const p = plan("a", "b");
    void cache.request(p);
    calls[0]?.answer(invalid);
    await flush();
    expect(cache.lookup(p)).toEqual({
      kind: "invalid",
      reason: { code: "type-mismatch", message: "No", entities: [] },
    });
  });
});

describe("verdict staleness", () => {
  it("discards a late verdict after a change touching the ports and asks once more", async () => {
    const { cache, calls } = setup();
    const p = plan("a", "b");
    const answer = cache.request(p);
    cache.invalidate(touching(["a"]));
    calls[0]?.answer(valid);
    await flush();
    expect(cache.lookup(p).kind).toBe("pending");
    expect(calls).toHaveLength(2);
    calls[1]?.answer(invalid);
    expect(await answer).toEqual(invalid);
    expect(cache.lookup(p).kind).toBe("invalid");
  });

  it("settles a second discard as a stale rejection", async () => {
    const { cache, calls } = setup();
    const p = plan("a", "b");
    const answer = cache.request(p);
    cache.invalidate(touching([], ["n-b"]));
    calls[0]?.answer(valid);
    await flush();
    cache.invalidate(touching(["b"]));
    calls[1]?.answer(valid);
    const settled = await answer;
    expect(settled).toMatchObject({
      valid: false,
      reason: { code: "validator-stale" },
    });
    expect(calls).toHaveLength(2);
  });

  it("asks wanted() on a discard and drops the entry when the caller moved on", async () => {
    const { cache, calls } = setup();
    const p = plan("a", "b");
    let wanted = true;
    const answer = cache.request(p, { wanted: () => wanted });
    cache.invalidate(touching(["a"]));
    wanted = false;
    calls[0]?.answer(valid);
    expect(await answer).toBeUndefined();
    expect(cache.lookup(p).kind).toBe("unknown");
    expect(calls).toHaveLength(1);
  });

  it("keeps the verdict when an unrelated node or port changes", async () => {
    const { cache, calls } = setup();
    const p = plan("a", "b");
    void cache.request(p);
    calls[0]?.answer(valid);
    await flush();
    cache.invalidate(touching(["x"], ["n-x"]));
    expect(cache.lookup(p)).toEqual({ kind: "valid" });
    await cache.request(p);
    expect(calls).toHaveLength(1);
  });

  it("drops a settled verdict when a change touches its ports and asks again", async () => {
    const { cache, calls } = setup();
    const p = plan("a", "b");
    void cache.request(p);
    calls[0]?.answer(valid);
    await flush();
    cache.invalidate(touching(["b"]));
    expect(cache.lookup(p).kind).toBe("unknown");
    void cache.request(p);
    expect(calls).toHaveLength(2);
  });
});

describe("verdict failures", () => {
  it.each([
    ["a missing reply", undefined],
    ["a reply without valid", { ok: true }],
    ["a rejection without a reason", { valid: false }],
    ["a reason without a message", { valid: false, reason: { code: "x" } }],
  ])("treats %s as a validator failure", async (_name, reply) => {
    const { cache, calls } = setup();
    const p = plan("a", "b");
    void cache.request(p);
    calls[0]?.answer(reply);
    await flush();
    expect(cache.lookup(p)).toMatchObject({
      kind: "invalid",
      reason: { code: "validator-failed", entities: ["a", "b"] },
    });
  });

  it("turns a rejected promise and a synchronous throw into coded rejections", async () => {
    const { cache, calls } = setup();
    const p = plan("a", "b");
    void cache.request(p);
    calls[0]?.fail(new Error("offline"));
    await flush();
    expect(cache.lookup(p)).toMatchObject({
      kind: "invalid",
      reason: { code: "validator-failed", message: "offline" },
    });
    const throwing = createVerdictCache({
      validator: () => {
        throw new Error("boom");
      },
      revision: () => toRevision("r1"),
    });
    const q = plan("c", "d");
    await throwing.request(q);
    expect(throwing.lookup(q)).toMatchObject({
      kind: "invalid",
      reason: { code: "validator-failed", message: "boom" },
    });
  });

  it("times out only when the host configures a timeout", async () => {
    vi.useFakeTimers();
    const none = setup();
    void none.cache.request(plan("a", "b"));
    await vi.advanceTimersByTimeAsync(3_600_000);
    expect(none.cache.lookup(plan("a", "b")).kind).toBe("pending");

    const timed = setup({ timeoutMs: 100 });
    const p = plan("c", "d");
    void timed.cache.request(p);
    await vi.advanceTimersByTimeAsync(99);
    expect(timed.cache.lookup(p).kind).toBe("pending");
    await vi.advanceTimersByTimeAsync(1);
    expect(timed.cache.lookup(p)).toMatchObject({
      kind: "invalid",
      reason: { code: "validator-timeout" },
    });
    expect(timed.calls[0]?.request.signal.aborted).toBe(true);
  });

  it("retries a failed entry on the next request and clears it with forgetFailures", async () => {
    const { cache, calls } = setup();
    const p = plan("a", "b");
    void cache.request(p);
    calls[0]?.fail(new Error("offline"));
    await flush();
    void cache.request(p);
    expect(calls).toHaveLength(2);
    calls[1]?.fail(new Error("offline"));
    await flush();
    expect(cache.lookup(p).kind).toBe("invalid");
    cache.forgetFailures();
    expect(cache.lookup(p).kind).toBe("unknown");
    expect(calls).toHaveLength(2);
  });

  it("forgets a failure per requester: one asker leaving keeps it for another", async () => {
    const { cache, calls } = setup();
    const p = plan("a", "b");
    const [one, two] = [{}, {}];
    void cache.request(p, { requester: one });
    void cache.request(p, { requester: two });
    calls[0]?.fail(new Error("offline"));
    await flush();
    cache.forgetFailures(one);
    expect(cache.lookup(p).kind).toBe("invalid");
    cache.forgetFailures({});
    expect(cache.lookup(p).kind).toBe("invalid");
    cache.forgetFailures(two);
    expect(cache.lookup(p).kind).toBe("unknown");
  });

  it("forgets every failure when no requester is named", async () => {
    const { cache, calls } = setup();
    const p = plan("a", "b");
    void cache.request(p, { requester: {} });
    calls[0]?.fail(new Error("offline"));
    await flush();
    cache.forgetFailures();
    expect(cache.lookup(p).kind).toBe("unknown");
  });

  it("keeps a real rejection verdict when failures are forgotten", async () => {
    const { cache, calls } = setup();
    const p = plan("a", "b");
    void cache.request(p);
    calls[0]?.answer(invalid);
    await flush();
    cache.forgetFailures();
    expect(cache.lookup(p).kind).toBe("invalid");
  });
});

describe("requesters, reset and dispose", () => {
  it("aborts a request only when no requester still wants it", () => {
    const { cache, calls } = setup();
    const p = plan("a", "b");
    const viewA = {};
    const viewB = {};
    void cache.request(p, { requester: viewA });
    void cache.request(p, { requester: viewB });
    cache.release(viewA);
    expect(calls[0]?.request.signal.aborted).toBe(false);
    expect(cache.lookup(p).kind).toBe("pending");
    cache.release(viewB);
    expect(calls[0]?.request.signal.aborted).toBe(true);
    expect(cache.lookup(p).kind).toBe("unknown");
  });

  it("lets a tool cancel its own request", async () => {
    const { cache, calls } = setup();
    const p = plan("a", "b");
    const tool = {};
    const answer = cache.request(p, { requester: tool });
    cache.cancel(p, tool);
    expect(calls[0]?.request.signal.aborted).toBe(true);
    expect(await answer).toBeUndefined();
  });

  it("ignores an answer that arrives after an abort", async () => {
    const { cache, calls } = setup();
    const p = plan("a", "b");
    const tool = {};
    void cache.request(p, { requester: tool });
    cache.cancel(p, tool);
    calls[0]?.answer(valid);
    await flush();
    expect(cache.lookup(p).kind).toBe("unknown");
  });

  it("reset aborts requests in flight, empties the cache and ignores late answers", async () => {
    const { cache, calls } = setup();
    const settled = plan("a", "b");
    const flying = plan("c", "d");
    void cache.request(settled);
    calls[0]?.answer(valid);
    await flush();
    const answer = cache.request(flying);
    cache.reset();
    expect(calls[1]?.request.signal.aborted).toBe(true);
    expect(await answer).toBeUndefined();
    calls[1]?.answer(valid);
    await flush();
    expect(cache.lookup(settled).kind).toBe("unknown");
    expect(cache.lookup(flying).kind).toBe("unknown");
  });

  it("dispose aborts and clears, and later requests do nothing", async () => {
    const { cache, calls } = setup();
    const p = plan("a", "b");
    const answer = cache.request(p);
    cache.dispose();
    expect(calls[0]?.request.signal.aborted).toBe(true);
    expect(await answer).toBeUndefined();
    expect(await cache.request(p)).toBeUndefined();
    expect(calls).toHaveLength(1);
    expect(cache.lookup(p).kind).toBe("unknown");
  });

  it("notifies subscribers when a verdict settles or entries go away", async () => {
    const { cache, calls } = setup();
    const listener = vi.fn();
    const off = cache.subscribe(listener);
    const p = plan("a", "b");
    void cache.request(p);
    expect(listener).not.toHaveBeenCalled();
    calls[0]?.answer(valid);
    await flush();
    expect(listener).toHaveBeenCalledTimes(1);
    cache.invalidate(touching(["a"]));
    expect(listener).toHaveBeenCalledTimes(2);
    off();
    cache.reset();
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("evicts the least recently used settled verdict beyond its capacity", async () => {
    const { cache, calls } = setup({ capacity: 2 });
    const [a, b, c] = [plan("a", "b"), plan("c", "d"), plan("e", "f")];
    for (const p of [a, b]) {
      void cache.request(p);
      calls[calls.length - 1]?.answer(valid);
      await flush();
    }
    cache.lookup(a);
    void cache.request(c);
    calls[calls.length - 1]?.answer(valid);
    await flush();
    expect(cache.lookup(a).kind).toBe("valid");
    expect(cache.lookup(b).kind).toBe("unknown");
    expect(cache.lookup(c).kind).toBe("valid");
  });

  it("notifies subscribers when a verdict is evicted", async () => {
    const { cache, calls } = setup({ capacity: 1 });
    const [a, b] = [plan("a", "b"), plan("c", "d")];
    void cache.request(a);
    calls[0]?.answer(valid);
    await flush();
    const listener = vi.fn();
    cache.subscribe(listener);
    void cache.request(b);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(cache.lookup(a).kind).toBe("unknown");
  });
});
