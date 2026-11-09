import { describe, expect, it } from "vitest";
import { connectionId } from "./base/ids/ids.js";
import { end, make, makeModel } from "./edit/commands/test-kit.js";
import { createDefaultConnectionPolicy } from "./edit/policy/default-policy.js";

describe("host verdicts are cleared right after commit", () => {
  it("a verdict an edit invalidates no longer approves the next queued edit", async () => {
    const model = makeModel({
      connectionValidator: async () => ({ valid: true }),
    });
    const src = make(model, "source");
    const dst = make(model, "sink", 200, 0);
    const outcome = createDefaultConnectionPolicy().evaluate(
      { from: end(src), to: end(dst) },
      model.reader,
    );
    if (outcome.kind !== "accept") throw new Error(outcome.kind);
    await model.verdicts?.request(outcome.plan);
    expect(model.verdicts?.lookup(outcome.plan).kind).toBe("valid");

    const settled: Promise<unknown>[] = [];
    let once = false;
    model.on("change", () => {
      if (once) return;
      once = true;
      // B moves the sink, which makes the verdict stale; C then adds the connection.
      const b = model.moveNodes([
        { node: dst.node, position: { x: 300, y: 0 } },
      ]);
      const c = model.submit({
        ops: [
          {
            op: "add",
            entity: "connection",
            record: {
              id: connectionId("c9"),
              kind: "default",
              from: end(src),
              to: end(dst),
            },
          },
        ],
      });
      for (const r of [b, c])
        if (r.status === "queued") settled.push(r.settled);
    });
    // An unrelated edit triggers the handler and leaves the verdict alone.
    model.createNode("sink", { x: 600, y: 0 });
    const [, added] = (await Promise.all(settled)) as [
      unknown,
      { status: string; rejection?: { code: string } },
    ];
    expect(added.status).toBe("rejected");
    expect(added.rejection?.code).toBe("pending-validation");
  });
});
