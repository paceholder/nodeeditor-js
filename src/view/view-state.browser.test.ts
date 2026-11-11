/// <reference types="@vitest/browser-playwright" />
import { describe, expect, it } from "vitest";
import { type CreationPlaceholder, nodeId } from "../core/index.js";
import {
  boxRegistry,
  fakeCreator,
  moveOf,
  seededModel,
} from "../core/io/sync/test-kit.js";
import { cleanupScope, frames, makeHost } from "./browser-support.js";
import { mountView } from "./mount-view.js";
import { createPainterRegistries } from "./render/registries/painters.js";

const cleanup = cleanupScope();

/**
 * A mounted view over a host-owned document (nodes A and B, connection AB) whose
 * painters record the `unconfirmed` flag they receive, per entity, from the last paint.
 */
function setup(options: Parameters<typeof seededModel>[0] = {}) {
  const { model, host } = seededModel({ registry: boxRegistry(), ...options });
  const flags = new Map<string, boolean>();
  const placeholders: CreationPlaceholder[][] = [];
  const painters = createPainterRegistries();
  painters.nodes.register("box", {
    paint: (_ctx, input) =>
      void flags.set(input.node.id, input.state.unconfirmed),
  });
  painters.portGlyphs.register("k", {
    paint: (_ctx, input) => void flags.set(input.port.id, input.unconfirmed),
  });
  painters.connections.register("default", {
    paint: (_ctx, input) =>
      void flags.set(input.connection.id, input.unconfirmed),
  });
  const view = mountView(makeHost(400, 200), { model, painters, input: false });
  cleanup(() => view.dispose());
  view.interaction.add({
    paint: (_ctx, _frame, state) =>
      void placeholders.push([...(state.placeholders?.() ?? [])]),
  });
  return { model, host, view, flags, placeholders };
}

describe("unconfirmed flag per entity: painters receive it from the view state", () => {
  it("a pending move marks its node unconfirmed for the node painter until the host accepts it", async () => {
    const { model, host, view, flags } = setup();
    await frames();
    expect(flags.get("A")).toBe(false);
    model.submit(moveOf(model, "A", { x: 20, y: 30 }));
    await frames();
    expect(flags.get("A")).toBe(true);
    expect(flags.get("B")).toBe(false);
    expect(flags.get("A.out")).toBe(false);
    expect(flags.get("AB")).toBe(false);
    host.answer(host.calls[0]?.operationId ?? "", { status: "accepted" });
    await Promise.resolve();
    // An acceptance changes nothing displayed, so nothing repaints by itself.
    view.invalidate("scene");
    await frames();
    expect(flags.get("A")).toBe(false);
  });

  it("connection and port painters receive the flag for the entities an edit touches", async () => {
    const { model, flags } = setup();
    await frames();
    const connection = model.reader.connections()[0];
    const port = model.reader.getPort(connection?.from.port ?? ("" as never));
    if (!connection || !port) throw new Error("fixture");
    model.submit({
      ops: [
        {
          op: "update",
          entity: "port",
          id: port.id,
          fields: { label: { new: "renamed" } },
        },
        {
          op: "update",
          entity: "connection",
          id: connection.id,
          fields: {
            route: {
              new: [{ kind: "segment", orientation: "vertical", at: 50 }],
            },
          },
        },
      ],
    });
    await frames();
    expect(flags.get(port.id)).toBe(true);
    expect(flags.get(connection.id)).toBe(true);
    expect(flags.get("B.in")).toBe(false);
  });
});

describe("placeholder for a pending creation: interaction painters receive it", () => {
  it("a delegated creation lists its placeholder in the view state, and the scene paints nothing for it", async () => {
    const creator = fakeCreator();
    const { model, view, flags, placeholders } = setup({
      nodeCreation: "delegated",
      onDelegate: creator.onDelegate,
    });
    await frames();
    expect(placeholders.at(-1)).toEqual([]);
    const result = model.createNode("box", { x: 300, y: 50 });
    expect(result.status).toBe("pending");
    view.interaction.invalidate();
    await frames();
    expect(placeholders.at(-1)).toEqual([
      expect.objectContaining({
        type: "box",
        position: { x: 300, y: 50 },
        state: "pending",
      }),
    ]);
    expect([...flags.keys()].sort()).toEqual(["A", "A.out", "AB", "B", "B.in"]);
    expect(model.reader.getNode(nodeId("n1"))).toBeUndefined();
  });
});
