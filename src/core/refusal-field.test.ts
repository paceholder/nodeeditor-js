import { describe, expect, it } from "vitest";
import { nodeId } from "./base/ids/ids.js";
import { reject } from "./base/result.js";
import { end, make, makeModel } from "./edit/commands/test-kit.js";
import type { FailureEvent } from "./edit/events/types.js";
import { createDefaultConnectionPolicy } from "./edit/policy/default-policy.js";
import { validateSnapshot } from "./io/snapshot/validate.js";

/** The refusal of `value`, read by the one field name, plus the names it must not use. */
function refusalOf(value: object): {
  readonly rejection: unknown;
  readonly others: readonly string[];
} {
  const keys = Object.keys(value);
  return {
    rejection: (value as { rejection?: unknown }).rejection,
    others: keys.filter((k) => k === "error" || k === "reason"),
  };
}

const code = (value: unknown): unknown =>
  typeof value === "object" && value !== null
    ? (value as { code?: unknown }).code
    : undefined;

describe("one field name for refusals", () => {
  it("a failed result carries its refusal in rejection", () => {
    const r = refusalOf(reject("unknown-entity", "No such node"));
    expect(code(r.rejection)).toBe("unknown-entity");
    expect(r.others).toEqual([]);
  });

  it("a whole-document validation failure carries its list in rejection", () => {
    const result = validateSnapshot({ format: "nope" });
    const r = refusalOf(result);
    expect(Array.isArray(r.rejection)).toBe(true);
    expect(r.others).toEqual([]);
  });

  it("a rejected edit, a rejected plan and an unavailable command use rejection", () => {
    const model = makeModel();
    const missing = {
      kind: "deleteEntities",
      nodes: [nodeId("n404")],
    } as const;
    const submitted = model.execute({
      kind: "moveNodes",
      moves: [{ node: nodeId("n404"), position: { x: 1, y: 1 } }],
    });
    const planned = model.plan(missing);
    const availability = model.can(missing);
    for (const value of [submitted, planned, availability]) {
      const r = refusalOf(value);
      expect(code(r.rejection)).toBeTypeOf("string");
      expect(r.others).toEqual([]);
    }
  });

  it("the policy's reject outcome uses rejection", () => {
    const model = makeModel();
    const a = make(model, "source");
    const b = make(model, "source", 100, 0);
    const outcome = createDefaultConnectionPolicy().evaluate(
      { from: end(a), to: end(b) },
      model.reader,
    );
    expect(outcome.kind).toBe("reject");
    const r = refusalOf(outcome);
    expect(code(r.rejection)).toBe("direction-mismatch");
    expect(r.others).toEqual([]);
  });

  it("a refused host verdict is read from rejection", async () => {
    const model = makeModel({
      connectionValidator: async () => ({
        valid: false,
        rejection: {
          code: "type-mismatch",
          message: "The host refuses",
          entities: [],
        },
      }),
    });
    const src = make(model, "source");
    const dst = make(model, "sink", 200, 0);
    const outcome = createDefaultConnectionPolicy().evaluate(
      { from: end(src), to: end(dst) },
      model.reader,
    );
    if (outcome.kind !== "accept") throw new Error(outcome.kind);
    await model.verdicts?.request(outcome.plan);
    const lookup = model.verdicts?.lookup(outcome.plan) ?? {};
    const r = refusalOf(lookup);
    expect(code(r.rejection)).toBe("type-mismatch");
    expect(r.others).toEqual([]);
  });

  it("the failure event of a refused edit uses rejection", () => {
    const model = makeModel();
    const seen: FailureEvent[] = [];
    model.on("failure", (e) => seen.push(e));
    model.execute({ kind: "deleteEntities", nodes: [nodeId("n404")] });
    const event = seen[0];
    if (!event) throw new Error("no failure event");
    expect(code(refusalOf(event).rejection)).toBeTypeOf("string");
  });
});
