import { describe, expect, it } from "vitest";
import {
  type CreationPlaceholder,
  createGraphModel,
  nodeId,
  operationId,
} from "../../core/index.js";
import { mergePendingState, pendingStateOf } from "./pending-state.js";

const ghost: CreationPlaceholder = {
  operationId: operationId("op1"),
  type: "box",
  position: { x: 0, y: 0 },
  state: "pending",
};

/** A model that reports unconfirmed state, with fixed answers. */
const reporting = (placeholders: readonly CreationPlaceholder[]) => ({
  unconfirmed: () => ({ nodes: [nodeId("A")], ports: [], connections: [] }),
  placeholders: () => placeholders,
});

describe("unconfirmed flag: what the view state tells painters", () => {
  it("a plain local model and a host view state without them leave the unconfirmed flag and the placeholders unset", () => {
    const merged = mergePendingState(pendingStateOf(createGraphModel()), {});
    expect(merged.isUnconfirmed).toBeUndefined();
    expect(merged.placeholders).toBeUndefined();
  });

  it("one source of placeholders is read as it is, without a new list per paint", () => {
    const list = [ghost];
    const merged = mergePendingState(pendingStateOf(reporting(list)), {});
    expect(merged.placeholders?.()).toBe(list);
    expect(merged.isUnconfirmed?.("A")).toBe(true);
    expect(merged.isUnconfirmed?.("B")).toBe(false);
  });

  it("the model's and the host's placeholders and flags are combined, model first", () => {
    const hosted = { ...ghost, operationId: operationId("op2") };
    const merged = mergePendingState(pendingStateOf(reporting([ghost])), {
      isUnconfirmed: (id) => id === "B",
      placeholders: () => [hosted],
    });
    expect(merged.placeholders?.()).toEqual([ghost, hosted]);
    expect(["A", "B", "C"].map((id) => merged.isUnconfirmed?.(id))).toEqual([
      true,
      true,
      false,
    ]);
  });
});
