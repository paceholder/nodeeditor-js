/// <reference types="@vitest/browser-playwright" />
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createGeometryRegistry } from "../core/index.js";
import { buildModel, twoPortNode } from "../core/space/scene/scene-fixtures.js";
import { frames } from "../view/browser-support.js";
import type { ViewHandle } from "../view/index.js";
import { EditorProvider, NodeEditor, useEditor } from "./index.js";
import { type Rendered, renderReact } from "./test-support/render-harness.js";

const rendered: Rendered[] = [];
afterEach(async () => {
  for (const r of rendered.splice(0)) await r.unmount();
  vi.restoreAllMocks();
});

/**
 * Net `pointerdown` registrations: adds minus removes, leaving out the test container
 * itself (React's own root delegation, which it never removes).
 */
const ours = (t: EventTarget): boolean =>
  !(t instanceof HTMLElement && "reactHarness" in t.dataset);

function trackPointerDown(): () => number {
  let live = 0;
  const add = EventTarget.prototype.addEventListener;
  const remove = EventTarget.prototype.removeEventListener;
  vi.spyOn(EventTarget.prototype, "addEventListener").mockImplementation(
    function (this: EventTarget, type, ...rest) {
      if (type === "pointerdown" && ours(this)) live += 1;
      return add.call(this, type, ...(rest as [never]));
    },
  );
  vi.spyOn(EventTarget.prototype, "removeEventListener").mockImplementation(
    function (this: EventTarget, type, ...rest) {
      if (type === "pointerdown" && ours(this)) live -= 1;
      return remove.call(this, type, ...(rest as [never]));
    },
  );
  return () => live;
}

/** Captures the handle the hook sees, for assertions. */
function Probe(props: { into: { view: ViewHandle | null } }): null {
  props.into.view = useEditor();
  return null;
}

const model = () => buildModel([twoPortNode("a", 100, 100)]);

function tree(
  props: Parameters<typeof NodeEditor>[0],
  seen: { view: ViewHandle | null },
) {
  return createElement(
    EditorProvider,
    null,
    createElement(NodeEditor, props),
    createElement(Probe, { into: seen }),
  );
}

describe("mount component", () => {
  it("mounts one view and disposes it on unmount", async () => {
    const seen = { view: null as ViewHandle | null };
    const r = await renderReact(tree({ model: model() }, seen));
    rendered.push(r);
    await frames();
    const view = seen.view;
    expect(view).not.toBeNull();
    expect(view?.disposed).toBe(false);
    expect(r.container.querySelectorAll("canvas").length).toBeGreaterThan(0);
    await r.unmount();
    expect(view?.disposed).toBe(true);
    expect(document.body.contains(view?.element ?? null)).toBe(false);
  });

  it("Strict Mode leaves exactly one live view and one set of listeners", async () => {
    const live = trackPointerDown();
    const seen = { view: null as ViewHandle | null };
    const r = await renderReact(tree({ model: model() }, seen), {
      strict: true,
    });
    rendered.push(r);
    await frames();
    const oneView = live();
    expect(oneView).toBeGreaterThan(0);
    expect(r.container.querySelectorAll("canvas")).toHaveLength(
      seen.view ? Object.keys(seen.view.canvases).length : -1,
    );
    await r.unmount();
    expect(live()).toBe(0);
  });

  it("a theme update repaints without replacing the view instance", async () => {
    const m = model();
    const seen = { view: null as ViewHandle | null };
    const r = await renderReact(tree({ model: m, theme: {} }, seen));
    rendered.push(r);
    await frames();
    const first = seen.view;
    const before = first?.theme();
    await r.rerender(
      tree({ model: m, theme: { background: "#123456" } }, seen),
    );
    await frames();
    expect(seen.view).toBe(first);
    expect(first?.disposed).toBe(false);
    expect(first?.theme()).not.toEqual(before);
    expect(first?.theme().background).toBe("#123456");
  });

  it("a changed geometry registry disposes the old view and mounts a new one without leaks", async () => {
    const live = trackPointerDown();
    const m = model();
    const seen = { view: null as ViewHandle | null };
    const r = await renderReact(
      tree({ model: m, geometry: createGeometryRegistry() }, seen),
    );
    rendered.push(r);
    await frames();
    const first = seen.view;
    const registrations = live();
    await r.rerender(
      tree({ model: m, geometry: createGeometryRegistry() }, seen),
    );
    await frames();
    expect(first?.disposed).toBe(true);
    expect(seen.view).not.toBe(first);
    expect(seen.view?.disposed).toBe(false);
    expect(live()).toBe(registrations);
    expect(r.container.querySelectorAll("canvas")).toHaveLength(
      Object.keys(seen.view?.canvases ?? {}).length,
    );
  });

  it("settable options do not remount; an inline input object does not either", async () => {
    const m = model();
    const seen = { view: null as ViewHandle | null };
    const r = await renderReact(
      tree({ model: m, input: { toolOptions: { gridStep: 10 } } }, seen),
    );
    rendered.push(r);
    await frames();
    const first = seen.view;
    await r.rerender(
      tree({ model: m, input: { toolOptions: { gridStep: 20 } } }, seen),
    );
    await frames();
    expect(seen.view).toBe(first);
    expect(first?.toolOptions().gridStep).toBe(20);
  });
});
