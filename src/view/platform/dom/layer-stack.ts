/**
 * DOM for one mounted view: a relative root holding three stacked canvases
 * (background, scene, interaction) and a pointer-transparent overlay div.
 * Browser APIs are only touched when `createLayerStack` is called.
 */
import type { LayerName } from "../frame-scheduler.js";

export interface LayerStack {
  readonly root: HTMLDivElement;
  readonly canvases: Readonly<Record<LayerName, HTMLCanvasElement>>;
  readonly overlay: HTMLDivElement;
  /** Set the backing store of every canvas, in device pixels (see `backingSize`). */
  resize(pixelWidth: number, pixelHeight: number): void;
  /** Remove all nodes and release canvas backing stores. */
  destroy(): void;
}

const FILL =
  "position:absolute;left:0;top:0;width:100%;height:100%;display:block;";

function makeCanvas(doc: Document, name: LayerName): HTMLCanvasElement {
  const canvas = doc.createElement("canvas");
  canvas.dataset.layer = name;
  canvas.style.cssText = `${FILL}pointer-events:none;`;
  return canvas;
}

export function createLayerStack(container: HTMLElement): LayerStack {
  const doc = container.ownerDocument;
  const root = doc.createElement("div");
  root.dataset.nodeeditorRoot = "";
  // No iOS callout or text selection while a touch is held (context-menu long-press).
  root.style.cssText =
    "position:relative;width:100%;height:100%;overflow:hidden;touch-action:none;" +
    "-webkit-touch-callout:none;user-select:none;-webkit-user-select:none;";
  const canvases = {
    background: makeCanvas(doc, "background"),
    scene: makeCanvas(doc, "scene"),
    interaction: makeCanvas(doc, "interaction"),
  };
  const overlay = doc.createElement("div");
  overlay.dataset.layer = "overlay";
  overlay.style.cssText = `${FILL}pointer-events:none;overflow:hidden;`;
  root.append(
    canvases.background,
    canvases.scene,
    canvases.interaction,
    overlay,
  );
  container.append(root);

  return {
    root,
    canvases,
    overlay,
    resize(pixelWidth, pixelHeight) {
      const w = Math.max(1, Math.round(pixelWidth));
      const h = Math.max(1, Math.round(pixelHeight));
      for (const canvas of Object.values(canvases)) {
        canvas.width = w;
        canvas.height = h;
      }
    },
    destroy() {
      for (const canvas of Object.values(canvases)) {
        canvas.width = 0;
        canvas.height = 0;
      }
      root.remove();
    },
  };
}
