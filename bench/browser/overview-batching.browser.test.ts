/// <reference types="@vitest/browser-playwright" />
/**
 * Overview batching (D3): an overview frame of F-TYPICAL issues a number
 * of `fill`/`stroke` calls bounded by its distinct styles plus the selected and diagnostic
 * entities, not by the number of entities on screen.
 */
import { resolveStyle } from "nodeeditor-js/view/advanced";
import { expect, it } from "vitest";
import { DEFAULT_SEED, F_TYPICAL } from "../fixtures/fixture-specs.js";
import { mountFixture, settle } from "./harness.js";

it("an overview frame of F-TYPICAL batches fill and stroke calls by style", async () => {
  const mounted = await mountFixture(F_TYPICAL, DEFAULT_SEED, 0.1);
  try {
    const { view, model } = mounted;
    const nodes = model.reader.nodes();
    const connections = model.reader.connections();
    const [selectedNode, errorNode] = nodes;
    const [selectedConnection] = connections;
    if (!selectedNode || !errorNode || !selectedConnection)
      throw new Error("fixture too small");
    const r = model.submit({
      ops: [
        {
          op: "update",
          entity: "node",
          id: errorNode.id,
          fields: { status: { new: "error" } },
        },
      ],
    });
    expect(r.status).toBe("accepted");
    view.selection.replace([
      `n:${selectedNode.id}`,
      `c:${selectedConnection.id}`,
    ]);
    await settle(300);

    // Instrument the scene context, then paint exactly one scene frame.
    const ctx = view.canvases.scene.getContext("2d");
    if (!ctx) throw new Error("no 2d context");
    const counts = { fill: 0, stroke: 0 };
    const fill = ctx.fill;
    const stroke = ctx.stroke;
    ctx.fill = ((...args: unknown[]) => {
      counts.fill++;
      Reflect.apply(fill, ctx, args);
    }) as typeof ctx.fill;
    ctx.stroke = ((...args: unknown[]) => {
      counts.stroke++;
      Reflect.apply(stroke, ctx, args);
    }) as typeof ctx.stroke;
    const before = view.renderStats().framesPainted;
    view.invalidate("scene");
    await settle(200);
    ctx.fill = fill;
    ctx.stroke = stroke;
    expect(view.renderStats().framesPainted).toBe(before + 1);

    const theme = view.theme();
    const nodeStyles = new Set(
      nodes.map((n) => {
        const s = resolveStyle(theme, { type: n.type, id: n.id });
        return `${s.nodeFill}|${s.nodeStroke}|${s.nodeLineWidth}`;
      }),
    ).size;
    const connectionStyles = new Set(
      connections.map((c) => {
        const s = resolveStyle(theme, { type: c.kind, id: c.id });
        return `${s.connectionColor}|${s.connectionWidth}`;
      }),
    ).size;
    // Node batches fill and stroke, connection batches stroke; two selection outlines
    // and one error badge are drawn individually.
    const bound = 2 * nodeStyles + connectionStyles + 2 + 1;
    const stats = view.renderStats();
    expect(stats.nodes.painted).toBe(nodes.length);
    expect(stats.paths.painted).toBe(connections.length);
    expect(counts.fill + counts.stroke).toBeGreaterThan(0);
    expect(counts.fill + counts.stroke).toBeLessThanOrEqual(bound);
    expect(bound).toBeLessThan(nodes.length / 10);
  } finally {
    mounted.dispose();
  }
}, 60_000);
