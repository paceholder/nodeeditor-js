import { describe, expect, it } from "vitest";
import { nodeId } from "../core/index.js";
import {
  createSelectionModel,
  nodeKey,
} from "./interact/selection/selection-model.js";
import { createAssetService } from "./render/assets/asset-service.js";
import { createPainterRegistries } from "./render/registries/painters.js";
import { createRouteEditorRegistry } from "./render/registries/route-editor-registry.js";

/** Subscribe one handler twice, drop the first, fire, and count the calls. */
function twice(
  subscribe: (handler: () => void) => () => void,
  fire: () => void,
): number {
  let calls = 0;
  const handler = (): void => void calls++;
  const first = subscribe(handler);
  subscribe(handler);
  fire();
  expect(calls).toBe(2);
  first();
  calls = 0;
  fire();
  return calls;
}

describe("independent change subscriptions", () => {
  it("a painter registry keeps the second subscription of one handler", () => {
    const p = createPainterRegistries();
    const painter = { paint() {} };
    expect(twice(p.nodes.onChange, () => p.nodes.replace("t", painter))).toBe(
      1,
    );
  });

  it("the background slot keeps the second subscription of one handler", () => {
    const p = createPainterRegistries();
    const bg = p.background.get();
    expect(twice(p.background.onChange, () => p.background.set(bg))).toBe(1);
  });

  it("the route editor registry keeps the second subscription of one handler", () => {
    const r = createRouteEditorRegistry();
    const editor = {} as Parameters<typeof r.replace>[1];
    expect(twice(r.onChange, () => r.replace("k", editor))).toBe(1);
  });

  it("the asset service keeps the second subscription of one handler", () => {
    const a = createAssetService();
    expect(twice(a.onChange, () => a.invalidate())).toBe(1);
    a.dispose();
  });

  it("the selection model keeps the second subscription of one handler", () => {
    const s = createSelectionModel();
    let n = 0;
    expect(
      twice(s.on, () => {
        s.replace([nodeKey(nodeId(`n${n++}`))]);
      }),
    ).toBe(1);
    s.dispose();
  });
});
