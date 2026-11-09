/// <reference types="@vitest/browser-playwright" />
import { act, createElement, type ReactNode } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { twoPortNode } from "../core/space/scene/scene-fixtures.js";
import { frames, selNode } from "../view/browser-support.js";
import type { ViewHandle } from "../view/index.js";
import { clipboardModel } from "../view/interact/clipboard/clipboard-fixtures.js";
import { EditorProvider, NodeEditor, useCommand, useEditor } from "./index.js";
import { type Rendered, renderReact } from "./test-support/render-harness.js";

const rendered: Rendered[] = [];
afterEach(async () => {
  for (const r of rendered.splice(0)) await r.unmount();
});

const seen = { view: null as ViewHandle | null };

function Grab(): null {
  seen.view = useEditor();
  return null;
}

function State(props: { command: string }): ReactNode {
  const c = useCommand(props.command);
  return createElement(
    "p",
    { id: props.command },
    c.available ? "yes" : (c.rejection?.message ?? "no"),
  );
}

async function mount(commands: string[]) {
  seen.view = null;
  const model = clipboardModel([twoPortNode("a", 100, 100)], []);
  const r = await renderReact(
    createElement(
      EditorProvider,
      null,
      createElement(NodeEditor, { model }),
      createElement(Grab),
      ...commands.map((command) =>
        createElement(State, { command, key: command }),
      ),
    ),
  );
  rendered.push(r);
  await frames();
  const view = seen.view as ViewHandle | null;
  if (!view) throw new Error("editor did not mount");
  const text = (id: string) =>
    r.container.querySelector(`[id="${id}"]`)?.textContent;
  return { view, text };
}

describe("command availability follows every trigger", () => {
  it("a paste button enables once something has been copied", async () => {
    const { view, text } = await mount(["edit.paste"]);
    expect(text("edit.paste")).not.toBe("yes");
    await act(async () => {
      view.selection.replace([selNode("a")]);
      view.commands.run("edit.copy");
    });
    expect(text("edit.paste")).toBe("yes");
  });

  it("a command registered after mount shows up without another event", async () => {
    const { view, text } = await mount(["app.custom"]);
    expect(text("app.custom")).not.toBe("yes");
    let off = () => {};
    await act(async () => {
      off = view.commands.register({
        id: "app.custom",
        labelKey: "app.custom",
        availability: () => ({ available: true }),
        run: () => ({ ok: true, value: { changed: false } }),
      });
    });
    expect(text("app.custom")).toBe("yes");
    await act(async () => off());
    expect(text("app.custom")).not.toBe("yes");
  });

  it("zoom in turns off when the zoom limits move to the current zoom", async () => {
    const { view, text } = await mount(["view.zoomIn"]);
    expect(text("view.zoomIn")).toBe("yes");
    const { zoom } = view.viewport.get();
    await act(async () => view.setZoomLimits({ max: zoom }));
    expect(text("view.zoomIn")).not.toBe("yes");
    await act(async () => view.setZoomLimits(undefined));
    expect(text("view.zoomIn")).toBe("yes");
  });
});
