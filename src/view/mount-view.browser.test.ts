import { afterEach, describe, expect, it, vi } from "vitest";
import { mountView } from "./mount-view.js";

const hosts: HTMLElement[] = [];
function host(w = 300, h = 200): HTMLElement {
  const el = document.createElement("div");
  el.style.cssText = `width:${w}px;height:${h}px;position:relative;`;
  document.body.append(el);
  hosts.push(el);
  return el;
}
const nextFrame = () =>
  new Promise<void>((r) => requestAnimationFrame(() => r()));

afterEach(() => {
  for (const h of hosts.splice(0)) h.remove();
  vi.restoreAllMocks();
});

describe("mountView", () => {
  it("creates three stacked canvases and an overlay", async () => {
    const el = host();
    const view = mountView(el);
    const layers = [...view.element.children].map(
      (c) => (c as HTMLElement).dataset.layer,
    );
    expect(layers).toEqual(["background", "scene", "interaction", "overlay"]);
    await nextFrame();
    await nextFrame();
    expect(view.canvases.scene.width).toBe(
      Math.round(300 * window.devicePixelRatio),
    );
    view.dispose();
  });

  it("dispose twice is safe and removes all DOM", () => {
    const el = host();
    const view = mountView(el);
    view.dispose();
    expect(() => view.dispose()).not.toThrow();
    expect(view.disposed).toBe(true);
    expect(el.childElementCount).toBe(0);
  });

  it("no listeners after dispose: observers disconnected, rAF cancelled", async () => {
    const disconnect = vi.spyOn(ResizeObserver.prototype, "disconnect");
    const cancel = vi.spyOn(window, "cancelAnimationFrame");
    const el = host();
    const view = mountView(el);
    view.invalidate("scene"); // pending frame request
    view.dispose();
    expect(disconnect).toHaveBeenCalledTimes(1);
    expect(cancel).toHaveBeenCalledTimes(1);

    const request = vi.spyOn(window, "requestAnimationFrame");
    view.invalidate("scene");
    el.style.width = "123px"; // would trigger the (disconnected) observer
    await nextFrame();
    await nextFrame();
    // Only the test's own nextFrame calls may request frames.
    expect(request).toHaveBeenCalledTimes(2);
  });

  it("idle view requests no animation frames", async () => {
    const el = host();
    const view = mountView(el);
    await nextFrame();
    await nextFrame();
    const request = vi.spyOn(window, "requestAnimationFrame");
    await new Promise((r) => setTimeout(r, 100));
    expect(request).not.toHaveBeenCalled();
    view.dispose();
  });
});

describe("accessible root", () => {
  it("the root has the application role, a role description and a default name", () => {
    const view = mountView(host());
    expect(view.element.getAttribute("role")).toBe("application");
    expect(view.element.getAttribute("aria-roledescription")).toBe(
      "node editor",
    );
    expect(view.element.getAttribute("aria-label")).toBe("Node editor");
    for (const canvas of Object.values(view.canvases)) {
      expect(canvas.getAttribute("aria-hidden")).toBe("true");
    }
    view.dispose();
  });

  it("the host can replace the name, and a remount starts from the default", () => {
    const el = host();
    const view = mountView(el);
    view.element.setAttribute("aria-label", "Circuit diagram");
    expect(
      el.querySelector("[role=application]")?.getAttribute("aria-label"),
    ).toBe("Circuit diagram");
    view.dispose();
    const again = mountView(el);
    expect(again.element.getAttribute("aria-label")).toBe("Node editor");
    again.dispose();
  });
});

describe("accessible name option", () => {
  it("the label mount option names the root", () => {
    const view = mountView(host(), { label: "Circuit diagram" });
    expect(view.element.getAttribute("aria-label")).toBe("Circuit diagram");
    view.dispose();
  });

  it("without the option the root is named Node editor", () => {
    const view = mountView(host(), {});
    expect(view.element.getAttribute("aria-label")).toBe("Node editor");
    view.dispose();
  });

  it("setLabel renames the mounted root, and no label restores Node editor", () => {
    const view = mountView(host(), { label: "Circuit diagram" });
    view.setLabel("Pump schematic");
    expect(view.element.getAttribute("aria-label")).toBe("Pump schematic");
    view.setLabel();
    expect(view.element.getAttribute("aria-label")).toBe("Node editor");
    view.dispose();
  });
});
