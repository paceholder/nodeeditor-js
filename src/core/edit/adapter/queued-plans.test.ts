import { describe, expect, it } from "vitest";
import { makeModel } from "../commands/test-kit.js";
import type { ExecuteResult } from "../commands/types.js";

const create = {
  kind: "createNode",
  type: "source",
  position: { x: 0, y: 0 },
} as const;

const settle = async (r: ExecuteResult) => {
  if (r.status !== "queued")
    throw new Error(`expected queued, got ${r.status}`);
  return r.settled;
};

describe("commands issued from inside a handler get distinct IDs", () => {
  it("two creates from one change handler both settle accepted with different IDs", async () => {
    const model = makeModel();
    const queued: ExecuteResult[] = [];
    let once = false;
    model.on("change", () => {
      if (once) return;
      once = true;
      queued.push(model.execute(create), model.execute(create));
    });
    expect(model.execute(create).status).toBe("accepted");
    const [a, b] = await Promise.all(queued.map(settle));
    expect(a?.status).toBe("accepted");
    expect(b?.status).toBe("accepted");
    if (a?.status === "accepted" && b?.status === "accepted") {
      expect(a.changed.nodes).not.toEqual(b.changed.nodes);
    }
    expect(model.reader.nodes()).toHaveLength(3);
  });

  it("after the queue drains, planning continues from the committed cursor", async () => {
    const model = makeModel();
    let once = false;
    let inner: ExecuteResult | undefined;
    model.on("change", () => {
      if (once) return;
      once = true;
      inner = model.execute(create);
    });
    model.execute(create);
    if (inner) await settle(inner);
    const next = model.execute(create);
    expect(next.status).toBe("accepted");
    if (next.status === "accepted") expect(next.changed.nodes).toEqual(["n3"]);
  });
});
