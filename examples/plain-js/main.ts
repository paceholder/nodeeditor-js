import {
  createCardGeometry,
  createGeometryRegistry,
  createGraphModel,
  createImageSymbolGeometry,
  type NodeRecord,
  point,
} from "nodeeditor-js";
import {
  createCardPainter,
  createConnectionPainter,
  createImageSymbolPainter,
  createPainterRegistries,
  createPortGlyphPainter,
  mountView,
} from "nodeeditor-js/view";
import pumpUrl from "./pump.svg?url";
import tankUrl from "./tank.svg?url";
import valveUrl from "./valve.svg?url";

// Static files stand in for whatever store a real host would use. The library never
// fetches by itself: this resolver is the only code that does, and only for these refs.
const ASSET_URLS: Readonly<Record<string, string>> = {
  "pump-symbol": pumpUrl,
  "valve-symbol": valveUrl,
  "tank-symbol": tankUrl,
};

async function resolveAsset(ref: string) {
  const url = ASSET_URLS[ref];
  if (!url) throw new Error(`unknown asset ${ref}`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`asset ${ref}: HTTP ${res.status}`);
  return { kind: "svg", text: await res.text() } as const;
}

// Model: image-symbol types carry an asset reference in their payload; ports sit on the
// picture's outline through durable placements, so they follow rotation and mirroring.
const model = createGraphModel();
const left = { x: 0, y: 0.5 };
const right = { x: 1, y: 0.5 };
const symbols = [
  {
    type: "pump",
    label: "Pump",
    size: { width: 80, height: 80 },
    ports: [
      { direction: "input", placement: left },
      { direction: "output", placement: right },
    ],
  },
  {
    type: "valve",
    label: "Valve",
    size: { width: 80, height: 50 },
    ports: [
      { direction: "input", placement: left },
      { direction: "output", placement: right },
    ],
  },
  {
    type: "tank",
    label: "Tank",
    size: { width: 70, height: 110 },
    ports: [
      { direction: "input", placement: { x: 0, y: 0.25 } },
      { direction: "output", placement: { x: 1, y: 0.8 } },
    ],
  },
] as const;
for (const s of symbols) {
  model.registry.register({
    type: s.type,
    label: s.label,
    defaultSize: s.size,
    ports: () => s.ports.map((p) => ({ ...p, typeKey: "pipe" })),
  });
}
model.registry.register({
  type: "controller",
  label: "Controller",
  defaultSize: { width: 150, height: 110 },
  ports: () => [
    { direction: "input", typeKey: "pipe", label: "feed" },
    { direction: "input", typeKey: "pipe", label: "setpoint" },
    { direction: "output", typeKey: "pipe", label: "status" },
  ],
});

function add(
  type: string,
  title: string,
  x: number,
  y: number,
  payload: { asset?: string; subtitle?: string },
): NodeRecord {
  model.createNode(type, { x, y }, { title, payload });
  const node = model.reader.nodes().find((n) => n.title === title);
  if (!node) throw new Error(`node ${title} was not created`);
  return node;
}
// A node's n-th port with the given direction, in presentation order.
const port = (n: NodeRecord, direction: "input" | "output", nth = 0) => {
  const p = model.reader.portsOf(n.id).filter((q) => q.direction === direction)[
    nth
  ];
  if (!p) throw new Error(`${direction} port ${nth} missing on ${n.title}`);
  return { node: n.id, port: p.id };
};

const tank = add("tank", "Feed tank", 130, 250, { asset: "tank-symbol" });
const pump = add("pump", "Pump", 320, 280, { asset: "pump-symbol" });
const valve = add("valve", "Valve", 500, 280, { asset: "valve-symbol" });
// Beside the tank, wired sideways, so no label sits on a wire.
const vent = add("valve", "Vent valve", -20, 222, { asset: "valve-symbol" });
const ctrl = add("controller", "Controller", 740, 270, { subtitle: "demo" });

model.connect(port(tank, "output"), port(pump, "input"));
model.connect(port(pump, "output"), port(valve, "input"));
model.connect(port(valve, "output"), port(ctrl, "input", 0)); // "feed"
model.connect(port(vent, "output"), port(tank, "input")); // tank "vent"

// Geometry and painters are separate registrations.
const geometry = createGeometryRegistry();
for (const s of symbols) {
  geometry.register(s.type, createImageSymbolGeometry({ paintedMargin: 22 }));
}
geometry.register("controller", createCardGeometry());

const painters = createPainterRegistries();
for (const s of symbols)
  painters.nodes.register(s.type, createImageSymbolPainter());
painters.nodes.register("controller", createCardPainter());
painters.portGlyphs.replace("pipe", createPortGlyphPainter());
painters.connections.replace(
  "default",
  createConnectionPainter({ arrowhead: true }),
);

const container = document.getElementById("editor");
if (!container) throw new Error("#editor is missing");
const view = mountView(container, {
  model, // the view builds its own scene and repaints on committed edits
  geometry,
  painters,
  assets: { resolve: resolveAsset },
  initialViewport: { zoom: 1, panX: 130, panY: 90 },
});

// Pan with the mouse and zoom with the wheel, only so the demo is explorable; real tools
// arrive with the interaction change.
let drag: { x: number; y: number } | undefined;
view.element.addEventListener("pointerdown", (e) => {
  drag = { x: e.clientX, y: e.clientY };
  view.element.setPointerCapture(e.pointerId);
});
view.element.addEventListener("pointermove", (e) => {
  if (!drag) return;
  view.viewport.panBy(e.clientX - drag.x, e.clientY - drag.y);
  drag = { x: e.clientX, y: e.clientY };
});
view.element.addEventListener("pointerup", () => {
  drag = undefined;
});
view.element.addEventListener(
  "wheel",
  (e) => {
    e.preventDefault();
    const box = view.element.getBoundingClientRect();
    view.viewport.zoomAt(
      point<"viewport">(e.clientX - box.left, e.clientY - box.top),
      Math.exp(-e.deltaY * 0.0015),
    );
  },
  { passive: false },
);

// Live updates: these keys edit the model through commands; the view only listens to
// committed changes, so it repaints by itself. Undo/redo go through the same path.
const here = (n: NodeRecord) => model.reader.getNode(n.id)?.position;
window.addEventListener("keydown", (e) => {
  switch (e.key.toLowerCase()) {
    case "m": {
      const at = here(pump);
      if (at) {
        model.moveNodes([
          { node: pump.id, position: { x: at.x, y: at.y === 280 ? 360 : 280 } },
        ]);
      }
      break;
    }
    case "e":
      model.updateNode(valve.id, {
        status:
          model.reader.getNode(valve.id)?.status === "error" ? "ok" : "error",
      });
      break;
    case "z":
      model.undo();
      break;
    case "y":
      model.redo();
      break;
  }
});

// Hot reload: release the old view before the module is replaced.
import.meta.hot?.dispose(() => {
  view.dispose();
});
