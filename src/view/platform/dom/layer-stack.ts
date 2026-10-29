/**
 * DOM for one mounted view: a relative root holding three stacked canvases
 * (background, scene, interaction) and a pointer-transparent overlay div (LAY-01).
 * Browser APIs are only touched when `createLayerStack` is called (REA-06).
 */
import type { LayerName } from "../frame-scheduler.js";

export interface LayerStack {
  readonly root: HTMLDivElement;
  readonly canvases: Readonly<Record<LayerName, HTMLCanvasElement>>;
  readonly overlay: HTMLDivElement;
  /** Set the backing store of every canvas to `css * dpr` (rounded, at least 1). */
  resize(cssWidth: number, cssHeight: number, dpr: number): void;
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
  root.style.cssText =
    "position:relative;width:100%;height:100%;overflow:hidden;touch-action:none;";
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
    resize(cssWidth, cssHeight, dpr) {
      const w = Math.max(1, Math.round(cssWidth * dpr));
      const h = Math.max(1, Math.round(cssHeight * dpr));
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
