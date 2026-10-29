import { describe, expect, it } from "vitest";
import {
  type ChangeEvent,
  createDefaultConnectionPolicy,
  createGraphModel,
  createNodeTypeRegistry,
} from "./index.js";

describe("UC-19 headless editing in plain Node", () => {
  it("registers types and a policy, edits, queries adjacency, and replays history", () => {
    const registry = createNodeTypeRegistry();
    registry.register({
      type: "gain",
      label: "Gain",
      defaultSize: { width: 60, height: 30 },
      ports: () => [
        { direction: "input", typeKey: "signal", label: "in" },
        { direction: "output", typeKey: "signal", label: "out" },
      ],
    });
    const model = createGraphModel({
      registry,
      connectionPolicy: createDefaultConnectionPolicy({ parallel: false }),
    });
    const events: ChangeEvent[] = [];
    model.on("change", (e) => events.push(e));

    model.createNode("gain", { x: 0, y: 0 });
    model.createNode("gain", { x: 100, y: 0 });
    const [a, b] = model.reader.nodes();
    if (!a || !b) throw new Error("setup");
    const [aIn, aOut] = a.ports;
    const [bIn] = b.ports;
    if (!aIn || !aOut || !bIn) throw new Error("setup");

    // Drawn from the input side on purpose: the plan normalizes it to output -> input.
    const connected = model.connect(
      { node: b.id, port: bIn },
      { node: a.id, port: aOut },
    );
    expect(connected.status).toBe("accepted");
    expect(model.reader.neighbors(a.id).map((n) => n.id)).toEqual([b.id]);
    expect(model.reader.connections()[0]?.from.port).toBe(aOut);

    // Direction errors come back as Results, not exceptions.
    const bad = model.connect(
      { node: a.id, port: aIn },
      { node: b.id, port: bIn },
    );
    expect(bad.status).toBe("rejected");

    model.moveNodes([{ node: a.id, position: { x: 5, y: 5 } }]);
    expect(events.map((e) => e.origin)).toEqual([
      "local",
      "local",
      "local",
      "local",
    ]);
    const revisions = events.map((e) => e.revision);
    expect([...revisions].sort()).toEqual(revisions);

    const final = JSON.stringify(model.reader.state().nodes);
    while (model.historyState().canUndo) model.undo();
    expect(model.reader.nodes()).toEqual([]);
    while (model.historyState().canRedo) model.redo();
    expect(JSON.stringify(model.reader.state().nodes)).toBe(final);
    expect(model.reader.connections()).toHaveLength(1);
  });
});
