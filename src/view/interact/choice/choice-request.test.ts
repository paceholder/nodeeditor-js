import { describe, expect, it } from "vitest";
import { type ChoiceAlternative, nodeId, portId } from "../../../core/index.js";
import { choiceOptions } from "./choice-request.js";

const plan = (kind: string) => ({
  from: { node: nodeId("a"), port: portId("aR") },
  to: { node: nodeId("b"), port: portId("bL") },
  connectionKind: kind,
  auxiliary: [],
});
const alternatives: ChoiceAlternative[] = [
  { key: "k2", label: "Second first", plan: plan("slow") },
  { key: "k1", label: "a.aR to b.bL", plan: plan("fast") },
];

describe("chooser options from policy alternatives", () => {
  it("options follow policy order and keep the policy keys", () => {
    expect(
      choiceOptions(alternatives).map((o) => [
        o.key,
        o.connectionKind,
        o.label,
      ]),
    ).toEqual([
      ["k2", "slow", "Second first"],
      ["k1", "fast", "a.aR to b.bL"],
    ]);
  });

  it("equal inputs give equal options", () => {
    expect(choiceOptions(alternatives)).toEqual(
      choiceOptions([...alternatives]),
    );
  });
});
