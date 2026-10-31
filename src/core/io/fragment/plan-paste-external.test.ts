import { describe, expect, it } from "vitest";
import type { PlanResult } from "../../edit/commands/types.js";
import type { GraphModel } from "../../graph-model.js";
import { createFragmentPlanners } from "./plan-paste.js";
import { contextOf, end, fragmentOf, make, makeModel } from "./test-kit.js";

const { paste, duplicate } = createFragmentPlanners();
const placement = { kind: "offset", by: { x: 20, y: 20 } } as const;

function sourceToSink(model: GraphModel) {
  const source = make(model, "source", 0, 0);
  const sink = make(model, "sink", 100, 0);
  model.connect(end(source), end(sink));
  const link = model.reader.connections()[0]?.id;
  if (!link) throw new Error("setup");
  return { source, sink, link };
}

function ready(plan: PlanResult) {
  if (plan.kind !== "ready") throw new Error(`plan ${plan.kind}`);
  return plan;
}

describe("external references on paste", () => {
  it("excludes an external connection by default and reports it", () => {
    const model = makeModel();
    const { sink, link } = sourceToSink(model);
    const fragment = fragmentOf(model, [sink.node]);
    const plan = ready(
      paste({ kind: "paste", fragment, placement }, contextOf(model)),
    );
    expect(plan.effects.created.connections).toEqual([]);
    expect(plan.effects.excluded).toEqual([
      { connection: link, reason: "external" },
    ]);
    model.submit(plan.patch);
    const copy = plan.effects.created.nodes[0];
    expect(copy && model.reader.connectionsOfNode(copy)).toEqual([]);
  });

  it("re-creates an external connection with host approval in the same entry", () => {
    const model = makeModel();
    const { source, sink } = sourceToSink(model);
    const plan = ready(
      duplicate(
        {
          kind: "duplicate",
          nodes: [sink.node],
          placement,
          external: "preserve",
        },
        contextOf(model),
      ),
    );
    expect(plan.effects.excluded).toEqual([]);
    expect(plan.effects.created.connections).toHaveLength(1);
    const before = model.historyState();
    expect(model.submit(plan.patch, { label: plan.label }).status).toBe(
      "accepted",
    );
    const copy = plan.effects.created.nodes[0];
    const [c] = copy ? model.reader.connectionsOfNode(copy) : [];
    expect(c?.from).toEqual(end(source));
    expect(c?.to.node).toBe(copy);
    expect(model.reader.connectionsOfPort(end(source).port)).toHaveLength(2);
    expect(model.historyState().canUndo).toBe(true);
    model.undo();
    expect(model.historyState().undoLabel).toBe(before.undoLabel);
    expect(model.reader.connections()).toHaveLength(1);
  });

  it("excludes a preserved connection whose outside endpoint is gone", () => {
    const model = makeModel();
    const { source, sink, link } = sourceToSink(model);
    const fragment = fragmentOf(model, [sink.node]);
    model.execute({ kind: "deleteEntities", nodes: [source.node] });
    const plan = ready(
      paste(
        { kind: "paste", fragment, placement, external: "preserve" },
        contextOf(model),
      ),
    );
    expect(plan.effects.excluded).toEqual([
      { connection: link, reason: "endpoint-missing" },
    ]);
    expect(model.submit(plan.patch).status).toBe("accepted");
    expect(model.reader.nodes()).toHaveLength(2);
  });

  it("excludes a preserved connection the policy refuses, with its code", () => {
    const model = makeModel();
    const { source, link } = sourceToSink(model);
    // The sink's input takes one connection, which the original already holds.
    const plan = ready(
      duplicate(
        {
          kind: "duplicate",
          nodes: [source.node],
          placement,
          external: "preserve",
        },
        contextOf(model),
      ),
    );
    expect(plan.effects.excluded).toEqual([
      { connection: link, reason: "capacity-exhausted" },
    ]);
  });
});
