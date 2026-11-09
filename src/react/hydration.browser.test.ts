/// <reference types="@vitest/browser-playwright" />
import { act, createElement } from "react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { buildModel, twoPortNode } from "../core/space/scene/scene-fixtures.js";
import { frames } from "../view/browser-support.js";
import { EditorProvider, NodeEditor, ViewControls } from "./index.js";

const tree = () =>
  createElement(
    EditorProvider,
    null,
    createElement(
      NodeEditor,
      {
        model: buildModel([twoPortNode("a", 100, 100)]),
        className: "editor",
        style: { width: 500, height: 300 },
      },
      createElement(ViewControls),
    ),
  );

describe("hydration", () => {
  it("server markup hydrates without an error and the view mounts afterwards", async () => {
    (
      globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    const host = document.createElement("div");
    host.style.cssText = "width:500px;height:300px;position:relative;";
    document.body.append(host);
    host.innerHTML = renderToString(tree());
    // The server output is an inert container: no canvas yet.
    expect(host.querySelector("canvas")).toBeNull();
    const errors: unknown[] = [];
    const warnings: unknown[][] = [];
    const warn = console.error;
    console.error = (...args: unknown[]) => {
      warnings.push(args);
    };
    let root: ReturnType<typeof hydrateRoot> | undefined;
    try {
      await act(async () => {
        root = hydrateRoot(host, tree(), {
          onRecoverableError: (e) => errors.push(e),
        });
      });
      await frames();
    } finally {
      console.error = warn;
    }
    try {
      expect(errors).toEqual([]);
      expect(warnings).toEqual([]);
      expect(host.querySelector("canvas")).not.toBeNull();
    } finally {
      await act(async () => root?.unmount());
      host.remove();
    }
  });
});
