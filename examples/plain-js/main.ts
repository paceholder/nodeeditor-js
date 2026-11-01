import {
  createCardGeometry,
  createGeometryRegistry,
  createGraphModel,
  createImageSymbolGeometry,
  type NodeRecord,
} from "nodeeditor-js";
import {
  COMMAND_IDS,
  createCardPainter,
  createConnectionPainter,
  createImageSymbolPainter,
  createPainterRegistries,
  createPortGlyphPainter,
  DEFAULT_KEYMAP,
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
    // Resizing is opt-in per type: only tanks get a corner handle, within these limits.
    ...(s.type === "tank"
      ? {
          capabilities: { resize: true },
          sizeLimits: {
            min: { width: 40, height: 60 },
            max: { width: 240, height: 360 },
          },
        }
      : {}),
  });
}
model.registry.register({
  type: "controller",
  label: "Controller",
  defaultSize: { width: 150, height: 110 },
  ports: () => [
    { direction: "input", typeKey: "pipe", label: "feed" },
    // A second port type, so some connections are refused: pipes and signals don't mix.
    { direction: "input", typeKey: "signal", label: "setpoint" },
    { direction: "output", typeKey: "signal", label: "status" },
  ],
});
model.registry.register({
  type: "sensor",
  label: "Sensor",
  defaultSize: { width: 150, height: 80 },
  ports: () => [{ direction: "output", typeKey: "signal", label: "level" }],
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
add("sensor", "Level sensor", 740, 90, { subtitle: "signal" });

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
geometry.register("sensor", createCardGeometry());

const painters = createPainterRegistries();
for (const s of symbols)
  painters.nodes.register(s.type, createImageSymbolPainter());
painters.nodes.register("controller", createCardPainter());
painters.nodes.register("sensor", createCardPainter());
painters.portGlyphs.replace("pipe", createPortGlyphPainter());
painters.portGlyphs.replace(
  "signal",
  createPortGlyphPainter({ labelFont: "11px system-ui, sans-serif" }),
);
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
  // Signal ports are square and amber, so the two port types read apart.
  theme: {
    typeOverrides: { signal: { portShape: "square", portFill: "#f2b84b" } },
  },
  initialViewport: { zoom: 1, panX: 130, panY: 90 },
  // Input is built in: pan, select, Shift-marquee, move, connect, wheel zoom and the
  // default keymap. Snapping starts off; the checkbox and G toggle it below. F is extra.
  input: {
    keymap: [
      ...DEFAULT_KEYMAP,
      { chord: "F", command: COMMAND_IDS.fitAll },
      { chord: "Shift+F", command: COMMAND_IDS.fitSelection },
    ],
  },
});
view.element.focus();

// Grid snapping is a runtime tool option: a 20-unit step when on, none when off.
const snapBox = document.querySelector<HTMLInputElement>("#snap input");
const setSnap = (on: boolean) => {
  view.setToolOptions({ gridStep: on ? 20 : undefined });
  if (snapBox) snapBox.checked = on;
};
snapBox?.addEventListener("change", () => {
  setSnap(snapBox.checked);
  view.element.focus();
});

// Live updates: P and E edit the model from outside the view through commands; the view
// only listens to committed changes, so it repaints by itself. They join the same undo
// history as the gestures (Ctrl/Cmd+Z, provided by the library keymap).
const here = (n: NodeRecord) => model.reader.getNode(n.id)?.position;
window.addEventListener("keydown", (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.target instanceof HTMLTextAreaElement) return;
  switch (e.key.toLowerCase()) {
    case "p": {
      const at = here(pump);
      if (at) {
        model.moveNodes([
          { node: pump.id, position: { x: at.x, y: at.y === 280 ? 360 : 280 } },
        ]);
      }
      break;
    }
    case "g":
      setSnap(view.toolOptions().gridStep === undefined);
      break;
    case "e":
      model.updateNode(valve.id, {
        status:
          model.reader.getNode(valve.id)?.status === "error" ? "ok" : "error",
      });
      break;
  }
});

// Clipboard: Ctrl/Cmd+C, X, V and D come with the default keymap. The status line shows
// what a paste left out; the buttons are a minimal host export/import dialog, the path
// that keeps working when the browser denies the system clipboard.
const status = document.getElementById("status");
const say = (text: string) => {
  if (status) status.textContent = text;
};
view.clipboard.on("paste", (outcome) => {
  if (!outcome.ok) say(`Paste refused: ${outcome.error.message}`);
  else {
    const left = outcome.value.excluded.map((x) => x.connection);
    say(
      `Pasted ${outcome.value.created.nodes.length} node(s)` +
        (left.length > 0
          ? `; external connections not copied: ${left.join(", ")}`
          : ""),
    );
  }
});
view.clipboard.on("copy", (r) =>
  say(`Copied (${r.excluded.length} external connection(s) left out)`),
);
view.clipboard.on("clipboard-error", (e) => say(e.message));

const dialog = document.querySelector<HTMLDialogElement>("#fragment");
const text = dialog?.querySelector("textarea");
const open = (value: string) => {
  if (!dialog || !text) return;
  text.value = value;
  dialog.showModal();
};
document.getElementById("export")?.addEventListener("click", () => {
  const exported = view.clipboard.exportText();
  if (exported.ok) open(exported.value);
  else say(`Export refused: ${exported.error.message}`);
});
document.getElementById("import")?.addEventListener("click", () => open(""));
document.getElementById("do-import")?.addEventListener("click", () => {
  if (text) view.clipboard.importText(text.value);
  dialog?.close();
  view.element.focus();
});
dialog?.addEventListener("close", () => view.element.focus());

// Hot reload: release the old view before the module is replaced.
import.meta.hot?.dispose(() => {
  view.dispose();
});
