/// <reference types="@vitest/browser-playwright" />
import { describe, expect, it } from "vitest";
import { nodeId } from "../core/index.js";
import { buildModel, twoPortNode } from "../core/space/scene/scene-fixtures.js";
import { cleanupScope, makeHost } from "./browser-support.js";
import { key, mouse } from "./interact/input/input-test-support.js";
import { mountView } from "./mount-view.js";

const cleanup = cleanupScope();

describe("tools lifecycle", () => {
  it("after 30 mount/dispose cycles no listener fires on the old roots and no gesture remains", () => {
    const model = buildModel([
      twoPortNode("a", 100, 100),
      twoPortNode("b", 300, 100),
    ]);
    const revision = model.reader.revision();
    // Count live registrations on window and document: they outlive the roots.
    const live = new Map<string, number>();
    const originalAdd = EventTarget.prototype.addEventListener;
    const originalRemove = EventTarget.prototype.removeEventListener;
    const tracked = (t: EventTarget): boolean => t === window || t === document;
    const bump = (t: EventTarget, type: string, by: number): void => {
      if (!tracked(t)) return;
      live.set(type, (live.get(type) ?? 0) + by);
    };
    EventTarget.prototype.addEventListener = function (
      this: EventTarget,
      type: string,
      ...rest: [EventListenerOrEventListenerObject | null, ...unknown[]]
    ) {
      bump(this, type, 1);
      return originalAdd.call(this, type, ...(rest as [EventListener]));
    } as typeof originalAdd;
    EventTarget.prototype.removeEventListener = function (
      this: EventTarget,
      type: string,
      ...rest: [EventListenerOrEventListenerObject | null, ...unknown[]]
    ) {
      bump(this, type, -1);
      return originalRemove.call(this, type, ...(rest as [EventListener]));
    } as typeof originalRemove;
    cleanup(() => {
      EventTarget.prototype.addEventListener = originalAdd;
      EventTarget.prototype.removeEventListener = originalRemove;
    });

    const roots: HTMLElement[] = [];
    const baseline = new Map(live);
    for (let i = 0; i < 30; i++) {
      const host = makeHost(500, 300);
      const view = mountView(host, { model });
      roots.push(view.element);
      // Odd cycles dispose in the middle of a drag.
      const pointer = mouse(view);
      if (i % 2 === 1) {
        pointer.down(100, 100);
        pointer.move(140, 110);
      }
      view.dispose();
    }
    // Old roots are detached; events on them reach nothing.
    for (const root of roots) {
      root.dispatchEvent(
        new PointerEvent("pointerdown", {
          pointerId: 1,
          clientX: 100,
          clientY: 100,
          bubbles: true,
        }),
      );
      key(root, "Delete");
    }
    expect(model.reader.revision()).toBe(revision);
    expect(model.reader.getNode(nodeId("a"))?.position).toEqual({
      x: 100,
      y: 100,
    });
    for (const [type, count] of live) {
      expect(count - (baseline.get(type) ?? 0), type).toBe(0);
    }
    // A fresh mount still works: no gesture was left active anywhere.
    const view = mountView(makeHost(500, 300), { model });
    cleanup(() => view.dispose());
    mouse(view).drag([100, 100], [140, 100]);
    expect(model.reader.revision()).toBe(revision + 1);
  });
});
