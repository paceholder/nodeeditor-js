/// <reference types="@vitest/browser-playwright" />
import { describe, expect, it } from "vitest";
import { cdp } from "vitest/browser";
import { type GraphModel, nodeId } from "../../../core/index.js";
import {
  buildModel,
  twoPortNode,
} from "../../../core/space/scene/scene-fixtures.js";
import { cleanupScope, frames, makeHost } from "../../browser-support.js";
import { mountView } from "../../mount-view.js";
import { clientOf, key, mouse } from "./input-test-support.js";

const cleanup = cleanupScope();

function setup() {
  const model: GraphModel = buildModel([
    twoPortNode("a", 100, 100),
    twoPortNode("b", 300, 100),
  ]);
  const host = makeHost(500, 300);
  const view = mountView(host, { model });
  cleanup(() => view.dispose());
  return { model, host, view, pointer: mouse(view) };
}

const posOf = (m: GraphModel, id: string) =>
  m.reader.getNode(nodeId(id))?.position;

/** Start dragging node a, so a gesture is in flight. */
function startDrag(s: ReturnType<typeof setup>) {
  s.pointer.down(100, 100);
  s.pointer.move(120, 110);
  s.pointer.move(160, 130);
}

/** After a cancellation nothing is committed and the next gesture works normally. */
function expectCleanAfter(s: ReturnType<typeof setup>, revision: number) {
  s.pointer.up(160, 130);
  expect(s.model.reader.revision()).toBe(revision);
  expect(posOf(s.model, "a")).toEqual({ x: 100, y: 100 });
  // The router is idle again: a fresh drag commits exactly one move.
  s.pointer.drag([100, 100], [140, 100]);
  expect(s.model.reader.revision()).toBe(revision + 1);
  expect(posOf(s.model, "a")).toEqual({ x: 140, y: 100 });
}

describe("DOM input adapter: cancellation", () => {
  it("INT-05 pointercancel leaves the committed state unchanged", () => {
    const s = setup();
    const revision = s.model.reader.revision();
    startDrag(s);
    s.host
      .querySelector("[data-nodeeditor-root]")
      ?.dispatchEvent(
        new PointerEvent("pointercancel", { pointerId: 1, bubbles: true }),
      );
    expectCleanAfter(s, revision);
  });

  it("INT-05 lostpointercapture cancels the gesture", () => {
    const s = setup();
    const revision = s.model.reader.revision();
    startDrag(s);
    s.view.element.dispatchEvent(
      new PointerEvent("lostpointercapture", { pointerId: 1, bubbles: true }),
    );
    expectCleanAfter(s, revision);
  });

  it("INT-05 window blur cancels the gesture", () => {
    const s = setup();
    const revision = s.model.reader.revision();
    startDrag(s);
    window.dispatchEvent(new Event("blur"));
    expectCleanAfter(s, revision);
  });

  it("INT-05 a hidden document cancels the gesture", () => {
    const s = setup();
    const revision = s.model.reader.revision();
    startDrag(s);
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => "hidden",
    });
    try {
      document.dispatchEvent(new Event("visibilitychange"));
    } finally {
      Reflect.deleteProperty(document, "visibilityState");
    }
    expectCleanAfter(s, revision);
  });

  it("INT-05 Escape cancels the gesture and leaves the selection alone", () => {
    const s = setup();
    const revision = s.model.reader.revision();
    startDrag(s);
    key(s.view.element, "Escape");
    expectCleanAfter(s, revision);
    expect(s.view.selection.keys()).toEqual(["n:a"]);
  });

  it("INT-05 dispose in the middle of a gesture commits nothing and detaches input", () => {
    const s = setup();
    const revision = s.model.reader.revision();
    startDrag(s);
    s.view.dispose();
    s.pointer.up(160, 130);
    s.pointer.drag([100, 100], [140, 100]);
    expect(s.model.reader.revision()).toBe(revision);
    expect(posOf(s.model, "a")).toEqual({ x: 100, y: 100 });
  });

  it("INT-05 unclaimed right-button presses keep the browser default", () => {
    const s = setup();
    const down = s.pointer.down(100, 100, {}, 2);
    expect(down.defaultPrevented).toBe(false);
    expect(s.view.selection.size).toBe(0);
  });
});

describe("DOM input adapter: real pointer capture", () => {
  it("INT-05 captures the pointer for the gesture and releases it on commit", async () => {
    const s = setup();
    await frames(2);
    // Real input from the browser, so the pointer is active and capture can succeed.
    const frame = window.frameElement?.getBoundingClientRect();
    const scale = frame ? frame.width / window.innerWidth : 1;
    const page = (wx: number, wy: number) => {
      const c = clientOf(s.view, wx, wy);
      return {
        x: (frame?.left ?? 0) + c.x * scale,
        y: (frame?.top ?? 0) + c.y * scale,
      };
    };
    const session = cdp();
    const send = (
      type: "mouseMoved" | "mousePressed" | "mouseReleased",
      p: { x: number; y: number },
    ) =>
      session.send("Input.dispatchMouseEvent", {
        type,
        x: p.x,
        y: p.y,
        button: "left",
        buttons: type === "mouseReleased" ? 0 : 1,
        clickCount: 1,
      });
    await send("mouseMoved", page(100, 100));
    await send("mousePressed", page(100, 100));
    await send("mouseMoved", page(120, 110));
    await send("mouseMoved", page(160, 130));
    // The pointer is captured by the root while the gesture runs.
    expect(s.view.element.hasPointerCapture(1)).toBe(true);
    await send("mouseReleased", page(160, 130));
    await frames(1);
    expect(s.view.element.hasPointerCapture(1)).toBe(false);
    expect(posOf(s.model, "a")).toEqual({ x: 160, y: 130 });
  });
});
