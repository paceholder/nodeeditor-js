/** Test fixtures for clipboard tests: a model whose fixture node type is registered. */
import {
  createGraphModel,
  createNodeTypeRegistry,
  type GraphModel,
  type GraphModelOptions,
  type Vec2,
} from "../../../core/index.js";
import {
  type ConnSpec,
  graphOps,
  type NodeSpec,
  twoPortNode,
} from "../../../core/space/scene/scene-fixtures.js";
import { createSelectionModel } from "../selection/selection-model.js";
import {
  type ClipboardOptions,
  createClipboardService,
  type SystemClipboard,
} from "./clipboard-service.js";

/** A model where the fixture type "t" is registered, so its nodes can be pasted. */
export function clipboardModel(
  nodes: readonly NodeSpec[] = [
    twoPortNode("a", 0, 0),
    twoPortNode("b", 100, 0),
  ],
  conns: readonly ConnSpec[] = [["c1", "a", "aR", "b", "bL"]],
  options: GraphModelOptions = {},
): GraphModel {
  const registry = createNodeTypeRegistry();
  registry.register({
    type: "t",
    label: "T",
    defaultSize: { width: 40, height: 20 },
  });
  const model = createGraphModel({ registry, ...options });
  const r = model.submit({ ops: graphOps(nodes, conns) }, { history: "skip" });
  if (r.status !== "accepted") throw new Error("fixture rejected");
  return model;
}

/** A fake system clipboard; `deny` makes both calls reject like a refused permission. */
export function fakeSystem(deny = false) {
  let text = "";
  const system: SystemClipboard = {
    writeText: async (t) => {
      if (deny) throw new Error("denied");
      text = t;
    },
    readText: async () => {
      if (deny) throw new Error("denied");
      return text;
    },
  };
  return {
    system,
    text: () => text,
    set: (t: string) => {
      text = t;
    },
  };
}

export function clipboardSetup(
  opts: {
    model?: GraphModel;
    system?: SystemClipboard;
    options?: ClipboardOptions;
  } = {},
) {
  const model = opts.model ?? clipboardModel();
  const selection = createSelectionModel();
  selection.bindToModel(model);
  let pointer: Vec2 | undefined;
  const service = createClipboardService({
    reader: model.reader,
    model,
    selection,
    pointer: () => pointer,
    system: opts.system,
    ...(opts.options ? { options: opts.options } : {}),
  });
  return {
    model,
    selection,
    service,
    setPointer: (p: Vec2 | undefined) => {
      pointer = p;
    },
  };
}
