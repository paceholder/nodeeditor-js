import {
  type Command,
  createCardGeometry,
  createGeometryRegistry,
  createGraphModel,
  type GraphModel,
} from "@paceholder/nodeeditor-js";
import {
  createCardPainter,
  createConnectionPainter,
  createPainterRegistries,
} from "@paceholder/nodeeditor-js/view";

/**
 * Applies a command as initial content: committed, but without an undo entry, so the first
 * Undo of the demo is disabled instead of taking the starting graph apart.
 */
function seed(model: GraphModel, command: Command): void {
  const planned = model.plan(command);
  if (planned.kind !== "ready") throw new Error("demo setup failed");
  const result = model.submit(planned.patch, { history: "skip" });
  if (result.status !== "accepted") throw new Error("demo setup failed");
}

/** A small graph of card nodes: the host owns the model, the editor only views it. */
export function createDemo() {
  const model = createGraphModel();
  model.registry.register({
    type: "source",
    label: "Source",
    defaultSize: { width: 150, height: 80 },
    ports: () => [{ direction: "output", typeKey: "signal", label: "out" }],
  });
  model.registry.register({
    type: "sink",
    label: "Sink",
    defaultSize: { width: 150, height: 80 },
    ports: () => [{ direction: "input", typeKey: "signal", label: "in" }],
  });
  const a = connectPair(model, "Source A", 0, 0);
  const b = connectPair(model, "Source B", 0, 140);
  seed(model, { kind: "connect", from: a.out, to: a.sinkIn });
  seed(model, { kind: "connect", from: b.out, to: b.sinkIn });

  const geometry = createGeometryRegistry();
  geometry.register("source", createCardGeometry());
  geometry.register("sink", createCardGeometry());
  const painters = createPainterRegistries();
  painters.nodes.register("source", createCardPainter());
  painters.nodes.register("sink", createCardPainter());
  painters.connections.replace(
    "default",
    createConnectionPainter({ arrowhead: true }),
  );
  return { model, geometry, painters, firstNode: a.sourceId };
}

function connectPair(model: GraphModel, title: string, x: number, y: number) {
  seed(model, {
    kind: "createNode",
    type: "source",
    position: { x, y },
    title,
  });
  seed(model, {
    kind: "createNode",
    type: "sink",
    position: { x: x + 320, y },
    title: `${title} sink`,
  });
  const nodes = model.reader.nodes();
  const source = nodes.find((n) => n.title === title);
  const sink = nodes.find((n) => n.title === `${title} sink`);
  const out = source && model.reader.portsOf(source.id)[0];
  const input = sink && model.reader.portsOf(sink.id)[0];
  if (!source || !sink || !out || !input) throw new Error("demo setup failed");
  return {
    sourceId: source.id,
    out: { node: source.id, port: out.id },
    sinkIn: { node: sink.id, port: input.id },
  };
}
