/**
 * Interactive performance demo: generates a fixture graph (the same generator the
 * benchmarks use), shows it with the default tools, and reports live statistics next to
 * it. The panel is plain HTML fed by `renderStats()` and a frame sampler; it never
 * repaints the canvases.
 */
import type { GraphModel } from "nodeeditor-js";
import { COMMAND_IDS, type ViewHandle } from "nodeeditor-js/view";
import {
  customSpec,
  DEFAULT_SEED,
  F_LARGE,
  F_SMALL,
  F_TYPICAL,
  type FixtureSpec,
} from "../../bench/fixtures/fixture-specs.js";
import {
  createFixtureModel,
  mountFixtureView,
} from "../../bench/fixtures/fixture-view.js";
import { generateFixture } from "../../bench/fixtures/generate-fixture.js";
import { createFrameSampler, type FrameSampler } from "./frame-sampler.js";
import { createStatsPanel, type StatsPanel } from "./stats-panel.js";
import { STRESS_ACTIONS } from "./stress.js";

const byId = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`#${id} is missing`);
  return el as T;
};

const host = byId("editor");
const fixtureSelect = byId<HTMLSelectElement>("fixture");
const countInput = byId<HTMLInputElement>("count");
const loadButton = byId<HTMLButtonElement>("load");
const stopButton = byId<HTMLButtonElement>("stop");
const status = byId("status");
const log = byId("log");

interface Loaded {
  readonly view: ViewHandle;
  readonly model: GraphModel;
  readonly sampler: FrameSampler;
  readonly panel: StatsPanel;
}

let loaded: Loaded | undefined;
let running: AbortController | undefined;
const actionButtons: HTMLButtonElement[] = [];

const nextTask = (): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, 0));
const nextFrame = (): Promise<number> =>
  new Promise((resolve) => requestAnimationFrame(resolve));

function specFromControls(): FixtureSpec {
  switch (fixtureSelect.value) {
    case "F-SMALL":
      return F_SMALL;
    case "F-LARGE":
      return F_LARGE;
    case "custom": {
      const n = Math.min(50_000, Math.max(10, Number(countInput.value) || 0));
      return customSpec(n);
    }
    default:
      return F_TYPICAL;
  }
}

function setBusy(busy: boolean): void {
  loadButton.disabled = busy || running !== undefined;
  for (const b of actionButtons)
    b.disabled = busy || running !== undefined || !loaded;
  stopButton.disabled = running === undefined;
}

function unload(): void {
  if (!loaded) return;
  loaded.panel.dispose();
  loaded.sampler.dispose();
  loaded.view.dispose();
  loaded.model.dispose();
  loaded = undefined;
}

async function load(spec: FixtureSpec): Promise<void> {
  unload();
  setBusy(true);
  status.textContent = `Generating ${spec.name} (${spec.nodes} nodes)...`;
  await nextTask();
  const t0 = performance.now();
  const snapshot = generateFixture(spec, DEFAULT_SEED);
  const t1 = performance.now();
  const model = createFixtureModel(snapshot);
  const t2 = performance.now();
  const view = mountFixtureView(host, model);
  await nextFrame();
  view.commands.run(COMMAND_IDS.fitAll);
  // Fit-all of a huge graph leaves nodes a few pixels wide; start at a readable zoom.
  if (view.viewport.get().zoom < 0.25) {
    const { width, height } = view.metrics();
    view.viewport.zoomAt(
      { x: width / 2, y: height / 2 },
      0.4 / view.viewport.get().zoom,
    );
  }
  view.element.focus();
  const sampler = createFrameSampler(view);
  const panel = createStatsPanel(byId("stats"), view, sampler);
  panel.setModelSize(
    model.reader.nodes().length,
    model.reader.connections().length,
  );
  loaded = { view, model, sampler, panel };
  status.textContent = `${spec.name}: generated in ${(t1 - t0).toFixed(0)} ms, loaded in ${(t2 - t1).toFixed(0)} ms`;
  setBusy(false);
}

function addLogLine(line: string): void {
  const li = document.createElement("li");
  li.textContent = line;
  log.prepend(li);
  while (log.children.length > 12) log.lastElementChild?.remove();
}

for (const action of STRESS_ACTIONS) {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = action.label;
  button.disabled = true;
  button.addEventListener("click", async () => {
    if (!loaded || running) return;
    const current = loaded;
    running = new AbortController();
    setBusy(false);
    try {
      const line = await action.run({
        view: current.view,
        model: current.model,
        sampler: current.sampler,
        signal: running.signal,
      });
      addLogLine(`${status.textContent?.split(":")[0] ?? ""} - ${line}`);
    } finally {
      running = undefined;
      setBusy(false);
    }
  });
  actionButtons.push(button);
  byId("actions").append(button);
}

stopButton.addEventListener("click", () => running?.abort());
loadButton.addEventListener("click", () => void load(specFromControls()));
fixtureSelect.addEventListener("change", () => {
  countInput.disabled = fixtureSelect.value !== "custom";
});
countInput.disabled = true;

// ?fixture=F-LARGE or ?nodes=20000 pre-selects what loads at start.
const params = new URLSearchParams(location.search);
const nodes = Number(params.get("nodes"));
if (nodes > 0) {
  fixtureSelect.value = "custom";
  countInput.value = String(nodes);
  countInput.disabled = false;
} else {
  const wanted = params.get("fixture");
  if (wanted && [...fixtureSelect.options].some((o) => o.value === wanted))
    fixtureSelect.value = wanted;
}
void load(specFromControls());

// Hot reload: release the old view before the module is replaced.
import.meta.hot?.dispose(() => {
  running?.abort();
  unload();
});
