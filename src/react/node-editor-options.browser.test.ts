/// <reference types="@vitest/browser-playwright" />
import { act, createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createGeometryRegistry } from "../core/index.js";
import { buildModel, twoPortNode } from "../core/space/scene/scene-fixtures.js";
import { frames } from "../view/browser-support.js";
import type { ViewHandle } from "../view/index.js";
import {
  EditorProvider,
  NodeEditor,
  useEditor,
  ViewControls,
} from "./index.js";
import { type Rendered, renderReact } from "./test-support/render-harness.js";

const rendered: Rendered[] = [];
afterEach(async () => {
  for (const r of rendered.splice(0)) await r.unmount();
});

type Seen = { view: ViewHandle | null };

function Probe(props: { into: Seen }): null {
  props.into.view = useEditor();
  return null;
}

const model = () => buildModel([twoPortNode("a", 100, 100)]);

function tree(props: Parameters<typeof NodeEditor>[0], seen: Seen) {
  return createElement(
    EditorProvider,
    null,
    createElement(NodeEditor, props),
    createElement(Probe, { into: seen }),
  );
}

describe("live options", () => {
  it("the locked prop is applied after mount without a remount", async () => {
    const m = model();
    const seen: Seen = { view: null };
    const r = await renderReact(tree({ model: m, locked: false }, seen));
    rendered.push(r);
    await frames();
    const first = seen.view;
    expect(first?.locked).toBe(false);
    await r.rerender(tree({ model: m, locked: true }, seen));
    await frames();
    expect(seen.view).toBe(first);
    expect(first?.locked).toBe(true);
    await r.rerender(tree({ model: m, locked: false }, seen));
    await frames();
    expect(seen.view).toBe(first);
    expect(first?.locked).toBe(false);
  });

  it("a view mounted locked starts locked", async () => {
    const seen: Seen = { view: null };
    const r = await renderReact(tree({ model: model(), locked: true }, seen));
    rendered.push(r);
    await frames();
    expect(seen.view?.locked).toBe(true);
  });

  it("without a locked prop the view owns the flag: onLockedChange hears the button and the API, and a remount keeps it", async () => {
    const m = model();
    const seen: Seen = { view: null };
    const changes: boolean[] = [];
    const props = (geometry = createGeometryRegistry()) => ({
      model: m,
      geometry,
      onLockedChange: (v: boolean) => changes.push(v),
      children: createElement(ViewControls),
    });
    const r = await renderReact(tree(props(), seen));
    rendered.push(r);
    await frames();
    const press = async () => {
      const lock = seen.view?.overlayElement.querySelector<HTMLButtonElement>(
        ".nodeeditor-controls__lock",
      );
      await act(async () => lock?.click());
    };
    await press();
    expect(seen.view?.locked).toBe(true);
    seen.view?.setLocked(true);
    seen.view?.setLocked(false);
    expect(changes).toEqual([true, false]);
    await act(async () => seen.view?.setLocked(true));
    // A new geometry registry remounts the view; it starts locked again, silently.
    const before = seen.view;
    await r.rerender(tree(props(), seen));
    await frames();
    expect(seen.view).not.toBe(before);
    expect(seen.view?.locked).toBe(true);
    expect(changes).toEqual([true, false, true]);
    await press();
    expect(changes).toEqual([true, false, true, false]);
  });

  it("with a locked prop the lock button is an attempt: it is reported and the view stays at the prop until the host passes a new value", async () => {
    const m = model();
    const seen: Seen = { view: null };
    const attempts: boolean[] = [];
    const props = (locked: boolean) => ({
      model: m,
      locked,
      onLockedChange: (v: boolean) => attempts.push(v),
      children: createElement(ViewControls),
    });
    const r = await renderReact(tree(props(false), seen));
    rendered.push(r);
    await frames();
    const lock = () =>
      seen.view?.overlayElement.querySelector<HTMLButtonElement>(
        ".nodeeditor-controls__lock",
      );
    await act(async () => lock()?.click());
    expect(attempts).toEqual([true]);
    expect(seen.view?.locked).toBe(false);
    // The host accepts: it passes true. The view locks, with no second report.
    await r.rerender(tree(props(true), seen));
    await frames();
    expect(seen.view?.locked).toBe(true);
    expect(attempts).toEqual([true]);
    // The host refuses a later unlock attempt by leaving the prop alone.
    await act(async () => lock()?.click());
    expect(attempts).toEqual([true, false]);
    expect(seen.view?.locked).toBe(true);
    // And a programmatic unlock is held the same way.
    await act(async () => seen.view?.setLocked(false));
    expect(seen.view?.locked).toBe(true);
  });
});

describe("initial and live options", () => {
  it("initial options are read once and never remount the view", async () => {
    const m = model();
    const seen: Seen = { view: null };
    const r = await renderReact(
      tree(
        {
          model: m,
          initialViewport: { zoom: 1, panX: 0, panY: 0 },
          initialFit: { paddingPx: 20 },
        },
        seen,
      ),
    );
    rendered.push(r);
    await frames();
    const first = seen.view;
    await r.rerender(
      tree(
        {
          model: m,
          initialViewport: { zoom: 1.5, panX: 5, panY: 5 },
          initialFit: { paddingPx: 40 },
        },
        seen,
      ),
    );
    await frames();
    expect(seen.view).toBe(first);
    expect(first?.disposed).toBe(false);
  });

  it("an inline theme with unchanged contents does not repaint, a changed one does", async () => {
    const m = model();
    const seen: Seen = { view: null };
    const r = await renderReact(
      tree({ model: m, theme: { background: "#112233" } }, seen),
    );
    rendered.push(r);
    await frames();
    const view = seen.view as ViewHandle;
    const setTheme = vi.spyOn(view, "setTheme");
    // A new object with the same contents on every render.
    await r.rerender(
      tree({ model: m, theme: { background: "#112233" } }, seen),
    );
    await r.rerender(
      tree({ model: m, theme: { background: "#112233" } }, seen),
    );
    expect(setTheme).not.toHaveBeenCalled();
    await r.rerender(
      tree({ model: m, theme: { background: "#445566" } }, seen),
    );
    expect(setTheme).toHaveBeenCalledTimes(1);
  });

  it("an unusable zoomLimits prop warns and is ignored, on a live view and at mount", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const m = model();
      const seen: Seen = { view: null };
      // Mounting with min above max must not throw out of the mount effect.
      const r = await renderReact(
        tree({ model: m, zoomLimits: { min: 3, max: 1 } }, seen),
      );
      rendered.push(r);
      await frames();
      expect(seen.view?.zoomLimits().max).toBeGreaterThan(1);
      expect(warn).toHaveBeenCalled();
      await r.rerender(
        tree({ model: m, zoomLimits: { min: 0.5, max: 2 } }, seen),
      );
      expect(seen.view?.zoomLimits()).toEqual({ min: 0.5, max: 2 });
      // A transient bad value on a live view keeps the previous limits.
      await r.rerender(
        tree({ model: m, zoomLimits: { min: 2, max: 0.5 } }, seen),
      );
      expect(seen.view?.zoomLimits()).toEqual({ min: 0.5, max: 2 });
      expect(seen.view?.disposed).toBe(false);
    } finally {
      warn.mockRestore();
    }
  });

  it("zoom limits update the live view, even as an inline object", async () => {
    const m = model();
    const seen: Seen = { view: null };
    const r = await renderReact(
      tree({ model: m, zoomLimits: { min: 0.5, max: 2 } }, seen),
    );
    rendered.push(r);
    await frames();
    const first = seen.view;
    expect(first?.zoomLimits()).toEqual({ min: 0.5, max: 2 });
    await r.rerender(
      tree({ model: m, zoomLimits: { min: 0.5, max: 2 } }, seen),
    );
    await r.rerender(
      tree({ model: m, zoomLimits: { min: 0.25, max: 3 } }, seen),
    );
    await frames();
    expect(seen.view).toBe(first);
    expect(first?.zoomLimits()).toEqual({ min: 0.25, max: 3 });
    await r.rerender(tree({ model: m }, seen));
    await frames();
    expect(seen.view).toBe(first);
    expect(first?.zoomLimits().min).toBeLessThan(0.25);
    expect(first?.zoomLimits().max).toBeGreaterThan(3);
  });
});

describe("theme and tool option props replace", () => {
  it("a theme prop without a key, or without the prop, restores the default", async () => {
    const m = model();
    const seen: Seen = { view: null };
    const r = await renderReact(tree({ model: m, theme: {} }, seen));
    rendered.push(r);
    await frames();
    const view = seen.view;
    const base = view?.theme();
    await r.rerender(
      tree(
        { model: m, theme: { background: "#123456", nodeFill: "#abcdef" } },
        seen,
      ),
    );
    expect(view?.theme().nodeFill).toBe("#abcdef");
    await r.rerender(
      tree({ model: m, theme: { background: "#654321" } }, seen),
    );
    expect(view?.theme().background).toBe("#654321");
    expect(view?.theme().nodeFill).toBe(base?.nodeFill);
    await r.rerender(tree({ model: m }, seen));
    expect(view?.theme().background).toBe(base?.background);
    expect(seen.view).toBe(view);
  });

  it("tool options replace: dropping a key or the prop restores the default", async () => {
    const m = model();
    const seen: Seen = { view: null };
    const r = await renderReact(
      tree({ model: m, input: { toolOptions: { gridStep: 10 } } }, seen),
    );
    rendered.push(r);
    await frames();
    const view = seen.view;
    await r.rerender(
      tree(
        { model: m, input: { toolOptions: { emptyDrag: "marquee" } } },
        seen,
      ),
    );
    expect(view?.toolOptions().emptyDrag).toBe("marquee");
    expect(view?.toolOptions().gridStep).toBeUndefined();
    await r.rerender(tree({ model: m, input: {} }, seen));
    expect(view?.toolOptions().emptyDrag).not.toBe("marquee");
    expect(seen.view).toBe(view);
  });
});

describe("remount warning", () => {
  it("warns once in development when a remount option is rebuilt on every render", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const m = model();
    const seen: Seen = { view: null };
    const r = await renderReact(
      tree({ model: m, geometry: createGeometryRegistry() }, seen),
    );
    rendered.push(r);
    for (let i = 0; i < 5; i++) {
      await r.rerender(
        tree({ model: m, geometry: createGeometryRegistry() }, seen),
      );
    }
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]?.[0])).toContain("remounted");
    warn.mockRestore();
  });

  it("does not warn when options are stable or change once", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const m = model();
    const seen: Seen = { view: null };
    const geometry = createGeometryRegistry();
    const r = await renderReact(tree({ model: m, geometry }, seen));
    rendered.push(r);
    for (let i = 0; i < 5; i++) {
      await r.rerender(tree({ model: m, geometry }, seen));
    }
    await r.rerender(
      tree({ model: m, geometry: createGeometryRegistry() }, seen),
    );
    await r.rerender(tree({ model: m, geometry }, seen));
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});
