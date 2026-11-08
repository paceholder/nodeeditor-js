import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

/** Browser globals that must not be read while importing or server-rendering the entry. */
const GLOBALS = [
  "window",
  "document",
  "navigator",
  "requestAnimationFrame",
  "ResizeObserver",
] as const;

type ReactEntry = typeof import("./index.js");

/** Reads every hook once and records what each returns. */
function Probe(props: { react: ReactEntry; seen: unknown[] }): null {
  const { react } = props;
  props.seen.push(
    react.useEditor(),
    react.useSelection(),
    react.useViewport(),
    react.useHistory(),
    react.useHover(),
    react.useCommandAvailability("edit.delete"),
    react.useNode("n1" as never),
  );
  return null;
}

describe("react entry in Node", () => {
  it("imports and server-renders the mount component without reading a browser global", async () => {
    const reads: string[] = [];
    // Node 22 has its own `navigator`; keep the original to restore it.
    const original = new Map(
      GLOBALS.map((name) => [
        name,
        Object.getOwnPropertyDescriptor(globalThis, name),
      ]),
    );
    for (const name of GLOBALS) {
      Object.defineProperty(globalThis, name, {
        configurable: true,
        get() {
          reads.push(name);
          return undefined;
        },
      });
    }
    try {
      vi.resetModules();
      const react = await import("./index.js");
      expect(typeof react.NodeEditor).toBe("function");
      const html = renderToString(
        createElement(
          react.EditorProvider,
          null,
          createElement(react.NodeEditor, { className: "editor" }),
        ),
      );
      // An inert container: one element, no canvas, nothing mounted.
      expect(html).toContain('class="editor"');
      expect(html).not.toContain("<canvas");
      expect(reads).toEqual([]);
    } finally {
      for (const name of GLOBALS) {
        const before = original.get(name);
        if (before) Object.defineProperty(globalThis, name, before);
        else delete (globalThis as Record<string, unknown>)[name];
      }
    }
  });

  it("hooks render inert defaults on the server", async () => {
    const react = await import("./index.js");
    const seen: unknown[] = [];
    renderToString(
      createElement(
        react.EditorProvider,
        null,
        createElement(Probe, { react, seen }),
      ),
    );
    expect(seen[0]).toBeNull();
    expect(seen[1]).toEqual({ keys: [], primary: undefined });
    expect(seen[2]).toEqual({ zoom: 1, panX: 0, panY: 0 });
    expect(seen[3]).toEqual({ canUndo: false, canRedo: false });
    expect(seen[4]).toBeNull();
    expect(seen[5]).toMatchObject({ available: false });
    expect(seen[6]).toBeUndefined();
  });
});
