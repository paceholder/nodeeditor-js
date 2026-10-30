/// <reference types="@vitest/browser-playwright" />
import { describe, expect, it } from "vitest";
import {
  buildModel,
  twoPortNode,
} from "../../../core/space/scene/scene-fixtures.js";
import { cleanupScope, frames, setDpr } from "../../browser-support.js";
import { mountView, type ViewHandle } from "../../mount-view.js";
import { mouse } from "./input-test-support.js";

const cleanup = cleanupScope();

/**
 * Nodes 40x20: a.R is at (120, 100), b.L at (300, 100); b2.L at (300, 130) is 30 world
 * units below the intended target, so a wrong offset or scale picks a different port.
 */
function mount(host: HTMLElement, zoom: number) {
  const model = buildModel([
    twoPortNode("a", 100, 100),
    twoPortNode("b", 320, 100),
    twoPortNode("b2", 320, 130),
  ]);
  const view = mountView(host, {
    model,
    initialViewport: { zoom, panX: 13.5, panY: 7.25 },
  });
  cleanup(() => view.dispose());
  return { model, view };
}

function expectConnectsTo(
  model: ReturnType<typeof mount>["model"],
  view: ViewHandle,
  target: string,
): void {
  mouse(view).drag([120, 100], [300, 100]);
  const connections = model.reader.connections();
  expect(connections).toHaveLength(1);
  expect(connections[0]?.from.port).toBe("aR");
  expect(connections[0]?.to.port).toBe(target);
}

function box(width: number, height: number, style = ""): HTMLElement {
  const el = document.createElement("div");
  el.style.cssText = `width:${width}px;height:${height}px;position:relative;${style}`;
  return el;
}

describe("pointer coordinates", () => {
  it("GEO-03 drag-to-connect hits the intended port under page scroll", async () => {
    const spacer = box(10, 900);
    const host = box(500, 300);
    document.body.append(spacer, host);
    cleanup(() => {
      spacer.remove();
      host.remove();
    });
    const { model, view } = mount(host, 1);
    await frames(2);
    window.scrollTo(0, 700);
    await frames(2);
    expect(window.scrollY).toBeGreaterThan(0);
    expect(host.getBoundingClientRect().top).toBeLessThan(900);
    expectConnectsTo(model, view, "bL");
    window.scrollTo(0, 0);
  });

  it("GEO-03 drag-to-connect hits the intended port in a nested offset container", async () => {
    const outer = box(700, 500, "margin:37px 0 0 53px;padding:11px;");
    const inner = box(600, 400, "left:23px;top:17px;border:5px solid #333;");
    const host = box(500, 300, "margin:9px 0 0 14px;");
    inner.append(host);
    outer.append(inner);
    document.body.append(outer);
    cleanup(() => outer.remove());
    const { model, view } = mount(host, 1);
    await frames(2);
    expectConnectsTo(model, view, "bL");
  });

  it("GEO-03 drag-to-connect hits the intended port at a fractional zoom", async () => {
    const host = box(500, 300);
    document.body.append(host);
    cleanup(() => host.remove());
    const { model, view } = mount(host, 1.37);
    await frames(2);
    expectConnectsTo(model, view, "bL");
  });

  it("GEO-03 drag-to-connect hits the intended port at device pixel ratio 2", async () => {
    await setDpr(2);
    const host = box(500, 300);
    document.body.append(host);
    cleanup(() => host.remove());
    const { model, view } = mount(host, 1.37);
    await frames(3);
    expect(view.metrics().dpr).toBe(2);
    expectConnectsTo(model, view, "bL");
  });
});
