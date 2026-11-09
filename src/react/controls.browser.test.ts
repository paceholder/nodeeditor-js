/// <reference types="@vitest/browser-playwright" />
import { act, createElement } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { rejectionOf } from "../core/index.js";
import { buildModel, twoPortNode } from "../core/space/scene/scene-fixtures.js";
import { frames, selNode } from "../view/browser-support.js";
import type { ViewHandle } from "../view/index.js";
import {
  ControlsButton,
  EditorProvider,
  NodeEditor,
  type NodeEditorProps,
  useEditor,
  ViewControls,
  type ViewControlsProps,
} from "./index.js";
import { type Rendered, renderReact } from "./test-support/render-harness.js";

const rendered: Rendered[] = [];
afterEach(async () => {
  for (const r of rendered.splice(0)) await r.unmount();
});

const seen = { view: null as ViewHandle | null };
beforeEach(() => {
  seen.view = null;
});

function Grab(): null {
  seen.view = useEditor();
  return null;
}

async function mount(
  controls: ViewControlsProps = {},
  editor: Partial<NodeEditorProps> = {},
) {
  // Far enough apart that the content does not fit at the start zoom.
  const model = buildModel([
    twoPortNode("a", -400, -300, { w: 60, h: 40 }),
    twoPortNode("b", 900, 700, { w: 60, h: 40 }),
  ]);
  const r = await renderReact(
    createElement(
      EditorProvider,
      null,
      createElement(NodeEditor, { model, ...editor }),
      createElement(Grab),
      createElement(ViewControls, controls),
    ),
  );
  rendered.push(r);
  await frames();
  const view = seen.view;
  if (!view) throw new Error("editor did not mount");
  const button = (name: string): HTMLButtonElement | null =>
    view.overlayElement.querySelector(`.nodeeditor-controls__${name}`);
  const press = async (name: string) => {
    const el = button(name);
    if (!el) throw new Error(`no ${name} button`);
    await act(async () => el.click());
    await frames();
  };
  return { view, model, button, press };
}

describe("view controls", () => {
  it("renders four plain buttons in the overlay, bottom-left by default", async () => {
    const { view, button } = await mount();
    const panel = view.overlayElement.querySelector(
      ".nodeeditor-controls",
    ) as HTMLElement;
    expect(panel.style.left).toBe("8px");
    expect(panel.style.bottom).toBe("8px");
    for (const name of ["zoom-in", "zoom-out", "fit", "lock"]) {
      expect(button(name)?.tagName).toBe("BUTTON");
    }
  });

  it("a button can be left out and the corner moved", async () => {
    const { view, button } = await mount({
      buttons: { lock: false, zoomOut: false },
      corner: "top-right",
    });
    expect(button("lock")).toBeNull();
    expect(button("zoom-out")).toBeNull();
    expect(button("fit")).not.toBeNull();
    const panel = view.overlayElement.querySelector(
      ".nodeeditor-controls",
    ) as HTMLElement;
    expect(panel.style.right).toBe("8px");
    expect(panel.style.top).toBe("8px");
  });

  it("Fit button: the viewport changes to show every node", async () => {
    const { view, press } = await mount();
    const before = view.viewport.get();
    await press("fit");
    const after = view.viewport.get();
    expect(after).not.toEqual(before);
    for (const id of ["a", "b"]) {
      const rect = view.nodeRect(id as never);
      const host = view.element.getBoundingClientRect();
      expect(rect?.x).toBeGreaterThanOrEqual(host.left);
      expect((rect?.x ?? 0) + (rect?.width ?? 0)).toBeLessThanOrEqual(
        host.right,
      );
      expect(rect?.y).toBeGreaterThanOrEqual(host.top);
      expect((rect?.y ?? 0) + (rect?.height ?? 0)).toBeLessThanOrEqual(
        host.bottom,
      );
    }
  });

  it("Lock toggle: locks, shows pressed, and unlocks again", async () => {
    const { view, button, press } = await mount();
    expect(button("lock")?.getAttribute("aria-pressed")).toBe("false");
    await press("lock");
    expect(view.locked).toBe(true);
    expect(button("lock")?.getAttribute("aria-pressed")).toBe("true");
    await press("lock");
    expect(view.locked).toBe(false);
    expect(button("lock")?.getAttribute("aria-pressed")).toBe("false");
  });

  it("Zoom limits respected: repeated presses stay inside the range", async () => {
    const { view, press } = await mount(
      {},
      { zoomLimits: { min: 0.5, max: 2 } },
    );
    for (let i = 0; i < 12; i++) await press("zoom-in");
    expect(view.viewport.get().zoom).toBeCloseTo(2, 5);
    for (let i = 0; i < 20; i++) await press("zoom-out");
    expect(view.viewport.get().zoom).toBeCloseTo(0.5, 5);
  });

  it("the zoom buttons run the view's zoom commands and disable at the limits", async () => {
    const { view, button, press } = await mount(
      {},
      { zoomLimits: { min: 0.5, max: 2 } },
    );
    expect(button("zoom-in")?.disabled).toBe(false);
    await act(
      async () => void view.commands.run("view.zoomIn", { factor: 100 }),
    );
    await frames();
    expect(view.viewport.get().zoom).toBe(2);
    expect(button("zoom-in")?.disabled).toBe(true);
    expect(button("zoom-in")?.title).toBe("Already at the maximum zoom");
    expect(button("zoom-out")?.disabled).toBe(false);
    await press("zoom-out");
    expect(view.viewport.get().zoom).toBeCloseTo(1.6, 9);
    expect(button("zoom-in")?.disabled).toBe(false);
    await act(
      async () => void view.commands.run("view.zoomOut", { factor: 100 }),
    );
    await frames();
    expect(button("zoom-out")?.disabled).toBe(true);
  });

  it("the zoom buttons work while the view is locked", async () => {
    const { view, press } = await mount();
    await press("lock");
    const before = view.viewport.get().zoom;
    await press("zoom-in");
    expect(view.viewport.get().zoom).toBeGreaterThan(before);
  });

  it("icons are inline SVG, and the lock icon follows the state", async () => {
    const { button, press } = await mount();
    const shape = () =>
      button("lock")?.querySelector("svg path:last-child")?.getAttribute("d");
    for (const name of ["zoom-in", "zoom-out", "fit", "lock"]) {
      expect(button(name)?.querySelector("svg")).not.toBeNull();
      expect(button(name)?.textContent).toBe("");
    }
    const open = shape();
    await press("lock");
    expect(shape()).not.toBe(open);
    await press("lock");
    expect(shape()).toBe(open);
  });

  it("icons can be replaced", async () => {
    const { button, press } = await mount({
      icons: {
        zoomIn: createElement("i", { className: "mine" }, "in"),
        locked: createElement("i", { className: "mine" }, "L"),
        unlocked: createElement("i", { className: "mine" }, "U"),
      },
    });
    expect(button("zoom-in")?.querySelector("i.mine")?.textContent).toBe("in");
    expect(button("lock")?.textContent).toBe("U");
    await press("lock");
    expect(button("lock")?.textContent).toBe("L");
    expect(button("fit")?.querySelector("svg")).not.toBeNull();
  });

  it("a host adds its own button as a child of the panel", async () => {
    let pressed = 0;
    const { view, press } = await mount({
      children: createElement(
        ControlsButton,
        {
          label: "Snap to grid",
          className: "nodeeditor-controls__snap",
          onClick: () => pressed++,
        },
        "#",
      ),
    });
    const panel = view.overlayElement.querySelector(".nodeeditor-controls");
    const own = panel?.querySelector(
      ".nodeeditor-controls__snap",
    ) as HTMLButtonElement;
    expect(own.getAttribute("aria-label")).toBe("Snap to grid");
    expect(own.type).toBe("button");
    expect(panel?.lastElementChild).toBe(own);
    await press("snap");
    expect(pressed).toBe(1);
  });

  it("a button is disabled with the reason when its command is unavailable", async () => {
    const { view, button } = await mount();
    expect(button("fit")?.disabled).toBe(false);
    await act(async () => {
      view.commands.register({
        id: "view.fitAll",
        labelKey: "command.view.fitAll",
        availability: () => ({
          available: false,
          rejection: rejectionOf("nothing-to-do", "No content"),
        }),
        run: () => ({ ok: true, value: { changed: false } }),
      });
      view.selection.replace([selNode("a")]);
    });
    await frames();
    expect(button("fit")?.disabled).toBe(true);
    expect(button("fit")?.title).toBe("No content");
  });

  it("a press on the panel starts no canvas gesture", async () => {
    const { view, press } = await mount();
    const before = view.viewport.get();
    await press("lock");
    await press("lock");
    expect(view.viewport.get()).toEqual(before);
    expect(view.selection.size).toBe(0);
  });
});
