/// <reference types="@vitest/browser-playwright" />
import { act, createElement, type ReactNode } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { buildModel, twoPortNode } from "../core/space/scene/scene-fixtures.js";
import { frames, selNode } from "../view/browser-support.js";
import type { ViewHandle } from "../view/index.js";
import {
  EditorProvider,
  NodeEditor,
  useCommand,
  useCommandAvailability,
  useEditor,
} from "./index.js";
import { type Rendered, renderReact } from "./test-support/render-harness.js";

const rendered: Rendered[] = [];
afterEach(async () => {
  for (const r of rendered.splice(0)) await r.unmount();
});

const seen = { view: null as ViewHandle | null, renders: 0 };

function Grab(): null {
  seen.view = useEditor();
  return null;
}

function AvailabilityText(): ReactNode {
  const a = useCommandAvailability("edit.delete");
  return createElement("p", { id: "out" }, a.available ? "yes" : "no");
}

function DeleteButton(): ReactNode {
  seen.renders += 1;
  const del = useCommand("edit.delete");
  return createElement(
    "button",
    {
      id: "del",
      type: "button",
      disabled: !del.available,
      title: del.rejection?.message ?? "",
      onClick: del.run,
    },
    "Delete",
  );
}

async function mount(...siblings: ReactNode[]) {
  seen.view = null;
  seen.renders = 0;
  const m = buildModel([
    twoPortNode("a", 100, 100),
    twoPortNode("b", 300, 100),
  ]);
  const r = await renderReact(
    createElement(
      EditorProvider,
      null,
      createElement(NodeEditor, { model: m }),
      createElement(Grab),
      ...siblings,
    ),
  );
  rendered.push(r);
  await frames();
  const view = seen.view as ViewHandle | null;
  if (!view) throw new Error("editor did not mount");
  return { r, m, view };
}

describe("command hooks follow the lock", () => {
  it("availability turns off when the view is locked and back on when unlocked", async () => {
    const { r, view } = await mount(createElement(AvailabilityText));
    const text = () => r.container.querySelector("#out")?.textContent;
    await act(async () => void view.selection.replace([selNode("a")]));
    expect(text()).toBe("yes");
    await act(async () => view.setLocked(true));
    expect(text()).toBe("no");
    await act(async () => view.setLocked(false));
    expect(text()).toBe("yes");
  });
});

describe("useCommand", () => {
  it("reports availability and the reason, and runs the command", async () => {
    const { r, m, view } = await mount(createElement(DeleteButton));
    const button = () => r.container.querySelector<HTMLButtonElement>("#del");
    expect(button()?.disabled).toBe(true);
    await act(async () => void view.selection.replace([selNode("a")]));
    expect(button()?.disabled).toBe(false);
    await act(async () => button()?.click());
    expect(m.reader.nodes()).toHaveLength(1);
    expect(button()?.disabled).toBe(true);
  });

  it("carries the lock reason while locked", async () => {
    const { r, view } = await mount(createElement(DeleteButton));
    await act(async () => void view.selection.replace([selNode("a")]));
    await act(async () => view.setLocked(true));
    const button = r.container.querySelector<HTMLButtonElement>("#del");
    expect(button?.disabled).toBe(true);
    expect(button?.title).not.toBe("");
  });

  it("does not re-render for changes that leave the answer unchanged", async () => {
    const { view } = await mount(createElement(DeleteButton));
    await act(async () => void view.selection.replace([selNode("a")]));
    const before = seen.renders;
    await act(async () => void view.selection.replace([selNode("b")]));
    expect(seen.renders).toBe(before);
  });
});
