/**
 * Mounts a generated fixture in a Canvas2D view with the default painters and tools.
 * Shared by the browser benchmarks and the interactive performance demo, so both measure
 * the same configuration. Imports the public view entry point only.
 */
import {
  createGraphModel,
  type GraphModel,
  type GraphSnapshot,
  loadSnapshot,
} from "@paceholder/nodeeditor-js";
import {
  createCardPainter,
  createImageSymbolPainter,
  createPainterRegistries,
  mountView,
  type ViewHandle,
  type ViewOptions,
} from "@paceholder/nodeeditor-js/view";
import { resolveFixtureAsset } from "./fixture-symbols.js";
import {
  CARD_TYPE,
  createFixtureGeometry,
  createFixtureNodeTypes,
  SYMBOL_TYPE,
} from "./fixture-types.js";

/** A model holding the snapshot; throws for programmer misuse (an invalid snapshot). */
export function createFixtureModel(snapshot: GraphSnapshot): GraphModel {
  const model = createGraphModel({ registry: createFixtureNodeTypes() });
  const loaded = loadSnapshot(model, snapshot);
  if (!loaded.ok) throw new Error("fixture snapshot failed to load");
  return model;
}

export function createFixturePainters() {
  const painters = createPainterRegistries();
  painters.nodes.register(SYMBOL_TYPE, createImageSymbolPainter());
  painters.nodes.register(CARD_TYPE, createCardPainter());
  return painters;
}

/** Mount `model` in `container`; `extra` may override any view option. */
export function mountFixtureView(
  container: HTMLElement,
  model: GraphModel,
  extra: Partial<ViewOptions> = {},
): ViewHandle {
  return mountView(container, {
    model,
    geometry: createFixtureGeometry(),
    painters: createFixturePainters(),
    assets: { resolve: resolveFixtureAsset },
    ...extra,
  });
}
