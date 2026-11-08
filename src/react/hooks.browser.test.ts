/// <reference types="@vitest/browser-playwright" />
import { act, createElement, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { nodeId } from "../core/index.js";
import { buildModel, twoPortNode } from "../core/space/scene/scene-fixtures.js";
import { frames } from "../view/browser-support.js";
import type { ViewHandle } from "../view/index.js";
import {
  EditorProvider,
  NodeEditor,
  useCommandAvailability,
  useEditor,
  useHistory,
  useSelection,
  useViewport,
} from "./index.js";
import { type Rendered, renderReact } from "./test-support/render-harness.js";

const rendered: Rendered[] = [];
afterEach(async () => {
  for (const r of rendered.splice(0)) await r.unmount();
});

// What the probe components below report back to the test that mounted them.
const seen = {
  view: null as ViewHandle | null,
  renders: 0,
  snapshots: [] as unknown[],
  history: [] as unknown[],
};
beforeEach(() => {
  seen.view = null;
  seen.renders = 0;
  seen.snapshots = [];
  seen.history = [];
});

const model = () =>
  buildModel([twoPortNode("a", 100, 100), twoPortNode("b", 300, 100)]);

function Grab(): null {
  seen.view = useEditor();
  return null;
}

function Inspector(): ReactNode {
  const { primary, keys } = useSelection();
  return createElement(
    "p",
    { id: "out" },
    `${primary ?? "none"}/${keys.length}`,
  );
}

function DeleteButton(): ReactNode {
  const a = useCommandAvailability("edit.delete");
  return createElement(
    "p",
    { id: "out" },
    a.available ? "yes" : `no:${a.reason.code}`,
  );
}

function HistoryBar(): ReactNode {
  const h = useHistory();
  return createElement(
    "p",
    { id: "out" },
    [h.canUndo, h.undoLabel ?? "-", h.canRedo, h.redoLabel ?? "-"].join("|"),
  );
}

function HistoryProbe(): null {
  seen.history.push(useHistory());
  return null;
}

function SnapshotProbe(props: { tick: number }): null {
  void props.tick;
  seen.snapshots.push(useSelection(), useViewport());
  return null;
}

function PanReadout(): ReactNode {
  seen.renders += 1;
  return createElement("p", { id: "out" }, String(useViewport().panX));
}

/** Mounts the editor next to the given sibling elements; returns the live view. */
async function mount(m: ReturnType<typeof model>, ...siblings: ReactNode[]) {
  const tree = (...next: ReactNode[]): ReactNode =>
    createElement(
      EditorProvider,
      null,
      createElement(NodeEditor, { model: m }),
      createElement(Grab),
      ...next,
    );
  const r = await renderReact(tree(...siblings));
  rendered.push(r);
  await frames();
  const view = seen.view;
  if (!view) throw new Error("editor did not mount");
  const text = () => r.container.querySelector("#out")?.textContent ?? "";
  return {
    r,
    view,
    text,
    rerender: (...next: ReactNode[]) => r.rerender(tree(...next)),
  };
}

describe("React hooks", () => {
  it("Inspector follows selection", async () => {
    const { view, text } = await mount(model(), createElement(Inspector));
    expect(text()).toBe("none/0");
    await act(async () => void view.selection.replace(["n:a"]));
    expect(text()).toBe("n:a/1");
    await act(async () => void view.selection.clear());
    expect(text()).toBe("none/0");
  });

  it("Command availability hook", async () => {
    const { view, text } = await mount(model(), createElement(DeleteButton));
    expect(text()).toMatch(/^no:/);
    await act(async () => void view.selection.replace(["n:a"]));
    expect(text()).toBe("yes");
    await act(async () => void view.selection.clear());
    expect(text()).toMatch(/^no:/);
  });

  it("History hook", async () => {
    const m = model();
    const { view, text } = await mount(m, createElement(HistoryBar));
    // The fixture's own setup edits are history too: undo is enabled before any edit.
    const initial = text().split("|");
    expect(initial[2]).toBe("false");
    await act(async () => {
      m.moveNodes([{ node: nodeId("a"), position: { x: 140, y: 100 } }]);
    });
    const afterEdit = text().split("|");
    expect(afterEdit[0]).toBe("true");
    expect(afterEdit[2]).toBe("false");
    await act(async () => void view.commands.run("history.undo"));
    const afterUndo = text().split("|");
    expect(afterUndo[2]).toBe("true");
    expect(afterUndo[3]).toBe(afterEdit[1]);
    expect(afterUndo[1]).toBe(initial[1]);
  });

  it("a read-only model gives an inert history", async () => {
    const full = model();
    const readOnly = { reader: full.reader, on: full.on };
    const r = await renderReact(
      createElement(
        EditorProvider,
        null,
        createElement(NodeEditor, { model: readOnly }),
        createElement(HistoryProbe),
      ),
    );
    rendered.push(r);
    await frames();
    expect(seen.history.at(-1)).toEqual({ canUndo: false, canRedo: false });
  });

  it("hook snapshots stay the same object while their value is unchanged", async () => {
    const m = model();
    const { rerender } = await mount(
      m,
      createElement(SnapshotProbe, { tick: 0 }),
    );
    const before = seen.snapshots.slice(-2);
    // An unrelated edit and a re-render must hand back the same snapshots.
    await act(async () => {
      m.moveNodes([{ node: nodeId("a"), position: { x: 150, y: 100 } }]);
    });
    await rerender(createElement(SnapshotProbe, { tick: 1 }));
    await frames();
    const after = seen.snapshots.slice(-2);
    expect(after[0]).toBe(before[0]);
    expect(after[1]).toBe(before[1]);
  });

  it("a pan renders the viewport hook at most once per frame", async () => {
    const { view, text } = await mount(model(), createElement(PanReadout));
    await frames();
    const before = seen.renders;
    await act(async () => {
      for (let i = 1; i <= 100; i++) view.viewport.panBy(1, 0);
    });
    await frames();
    expect(seen.renders - before).toBeLessThanOrEqual(1);
    expect(text()).toBe("100");
  });
});
