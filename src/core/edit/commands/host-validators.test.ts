import { describe, expect, it } from "vitest";
import { rejectionOf } from "../../base/result.js";
import { makeModel } from "./test-kit.js";
import type { Command } from "./types.js";

const create: Command = {
  kind: "createNode",
  type: "source",
  position: { x: 0, y: 0 },
};

describe("planning sees every registered validator", () => {
  it("a validator added with addValidator refuses can, plan and execute alike", () => {
    const model = makeModel();
    const off = model.addValidator({
      validate: () => rejectionOf("conflict", "host says no"),
    });
    const can = model.can(create);
    expect(can.available).toBe(false);
    if (!can.available) expect(can.reason.message).toBe("host says no");
    expect(model.plan(create).kind).toBe("rejected");
    expect(model.execute(create).status).toBe("rejected");
    off();
    expect(model.can(create).available).toBe(true);
    expect(model.plan(create).kind).toBe("ready");
  });
});
