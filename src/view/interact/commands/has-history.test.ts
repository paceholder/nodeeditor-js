import { describe, expect, it } from "vitest";
import {
  buildModel,
  twoPortNode,
} from "../../../core/space/scene/scene-fixtures.js";
import type { ViewModel } from "../../platform/model-binding.js";
import { hasHistory, isEditable } from "./editable-model.js";

describe("hasHistory guard", () => {
  it("accepts a model that reports history and rejects a read-only one", () => {
    const model = buildModel([twoPortNode("a", 0, 0)]);
    expect(hasHistory(model)).toBe(true);
    const readOnly: ViewModel = {
      reader: model.reader,
      on: model.on.bind(model),
    };
    expect(hasHistory(readOnly)).toBe(false);
    expect(isEditable(readOnly)).toBe(false);
  });

  it("a model with history but no command API has history without being editable", () => {
    const model = buildModel([twoPortNode("a", 0, 0)]);
    const partial = {
      reader: model.reader,
      on: model.on.bind(model),
      historyState: () => ({ canUndo: false, canRedo: false }),
    } as unknown as ViewModel;
    expect(hasHistory(partial)).toBe(true);
    expect(isEditable(partial)).toBe(false);
  });
});
