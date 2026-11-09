import { afterEach, describe, expect, it, vi } from "vitest";
import { end, make, makeModel } from "./edit/commands/test-kit.js";
import { createDefaultConnectionPolicy } from "./edit/policy/default-policy.js";
import type {
  ConnectionVerdict,
  VerdictRequest,
} from "./edit/policy/verdict-types.js";
import type { GraphModel } from "./graph-model.js";
import { exportSnapshot } from "./io/snapshot/export.js";
import { loadSnapshot } from "./io/snapshot/load.js";

const flush = async () => {
  for (let i = 0; i < 6; i++) await Promise.resolve();
};

/** A validator the test answers by hand. */
function manual() {
  const calls: {
    request: VerdictRequest;
    answer(verdict: ConnectionVerdict): void;
  }[] = [];
  const validator = (request: VerdictRequest) =>
    new Promise<ConnectionVerdict>((resolve) => {
      calls.push({ request, answer: resolve });
    });
  return { validator, calls };
}

/** What a tool does: request the verdict for the plan the base policy gives. */
function request(
  model: GraphModel,
  from: ReturnType<typeof end>,
  to: typeof from,
) {
  const outcome = createDefaultConnectionPolicy().evaluate(
    { from, to },
    model.reader,
  );
  if (outcome.kind !== "accept") throw new Error(outcome.kind);
  const verdicts = model.verdicts;
  if (!verdicts) throw new Error("no verdicts");
  return verdicts.request(outcome.plan);
}

afterEach(() => {
  vi.useRealTimers();
});

describe("the model owns the verdict cache", () => {
  it("has no cache without a validator and connects as before", () => {
    const model = makeModel();
    expect(model.verdicts).toBeUndefined();
    const src = make(model, "source");
    const dst = make(model, "sink");
    expect(model.connect(end(src), end(dst)).status).toBe("accepted");
  });

  it("connects only after a verdict is requested through model.verdicts", async () => {
    const { validator, calls } = manual();
    const model = makeModel({ connectionValidator: validator });
    const src = make(model, "source");
    const dst = make(model, "sink");
    expect(model.connect(end(src), end(dst)).status).toBe("unverified");
    const answer = request(model, end(src), end(dst));
    expect(calls[0]?.request.revision).toBe(model.revision());
    calls[0]?.answer({ valid: true });
    await answer;
    expect(model.connect(end(src), end(dst)).status).toBe("accepted");
  });

  it("drops a verdict when a change touches its node and keeps it for an unrelated one", async () => {
    const { validator, calls } = manual();
    const model = makeModel({ connectionValidator: validator });
    const src = make(model, "source");
    const dst = make(model, "sink");
    const unrelated = make(model, "sink", 300, 0);
    const answer = request(model, end(src), end(dst));
    calls[0]?.answer({ valid: true });
    await answer;
    const probe = () =>
      model.can({ kind: "connect", from: end(src), to: end(dst) });
    expect(probe().available).toBe(true);
    model.moveNodes([{ node: unrelated.node, position: { x: 310, y: 0 } }]);
    expect(probe().available).toBe(true);
    model.moveNodes([{ node: dst.node, position: { x: 10, y: 0 } }]);
    expect(probe().available).toBe(false);
  });

  it("aborts requests in flight on reset and ignores their late answers", async () => {
    const { validator, calls } = manual();
    const model = makeModel({ connectionValidator: validator });
    const src = make(model, "source");
    const dst = make(model, "sink");
    const answer = request(model, end(src), end(dst));
    expect(loadSnapshot(model, exportSnapshot(model)).ok).toBe(true);
    expect(calls[0]?.request.signal.aborted).toBe(true);
    expect(await answer).toBeUndefined();
    calls[0]?.answer({ valid: true });
    await flush();
    expect(model.connect(end(src), end(dst)).status).toBe("unverified");
  });

  it("disposes the cache with the model", () => {
    const { validator, calls } = manual();
    const model = makeModel({ connectionValidator: validator });
    const src = make(model, "source");
    const dst = make(model, "sink");
    void request(model, end(src), end(dst));
    model.dispose();
    expect(calls[0]?.request.signal.aborted).toBe(true);
  });

  it("uses timeoutMs for the validator and has no timeout without it", async () => {
    vi.useFakeTimers();
    const { validator } = manual();
    const model = makeModel({ connectionValidator: validator, timeoutMs: 50 });
    const src = make(model, "source");
    const dst = make(model, "sink");
    const answer = request(model, end(src), end(dst));
    await vi.advanceTimersByTimeAsync(50);
    expect(await answer).toMatchObject({
      valid: false,
      rejection: { code: "validator-timeout" },
    });
  });
});
