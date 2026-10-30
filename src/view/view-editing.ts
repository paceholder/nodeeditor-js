/**
 * Editing wiring for a mounted view (D10): selection, the command
 * registry, tool routing and the DOM input adapter, built over the view's scene and
 * viewport. `mountView` owns the lifetime; this module owns nothing global.
 */
import {
  err,
  type GeometryScene,
  type GraphReader,
  type HitCandidate,
  type Rejection,
  rejectionOf,
} from "../core/index.js";
import { registerBuiltinCommands } from "./interact/commands/builtin-commands.js";
import {
  type CommandRegistry,
  createCommandRegistry,
} from "./interact/commands/command-registry.js";
import {
  type EditableModel,
  isEditable,
} from "./interact/commands/editable-model.js";
import {
  createKeymap,
  DEFAULT_KEYMAP,
  detectPlatform,
} from "./interact/commands/keymap.js";
import {
  createViewCommands,
  type ViewCommandOutcome,
  type ViewCommands,
} from "./interact/commands/view-commands.js";
import { attachDomInput, type DomInput } from "./interact/input/dom-input.js";
import type { SelectionModel } from "./interact/selection/selection-model.js";
import { defaultToolSlots } from "./interact/tools/default-tools.js";
import {
  resolveToolOptions,
  type ToolOptions,
} from "./interact/tools/thresholds.js";
import {
  capabilityProbe,
  createToolContext,
} from "./interact/tools/tool-context.js";
import { createToolRouter } from "./interact/tools/tool-router.js";
import type { ToolPreview } from "./interact/tools/tool-types.js";
import type { ViewModel } from "./platform/model-binding.js";
import type { ViewportState } from "./platform/viewport-state.js";
import type { InputOptions } from "./view-types.js";

export interface EditingDeps {
  readonly root: HTMLElement;
  readonly overlay: HTMLElement;
  readonly model: ViewModel | undefined;
  readonly scene: GeometryScene | undefined;
  readonly selection: SelectionModel;
  readonly viewport: ViewportState;
  readonly size: () => { width: number; height: number };
  readonly setPreview: (preview: ToolPreview | null) => void;
  readonly setHovered: (id: string | undefined) => void;
  /** `false` keeps selection and commands but attaches no DOM listeners. */
  readonly input: false | InputOptions;
}

export interface Editing {
  readonly commands: CommandRegistry;
  toolOptions(): ToolOptions;
  setToolOptions(patch: Partial<ToolOptions>): void;
  dispose(): void;
}

const NO_MODEL: Rejection = rejectionOf(
  "unknown-entity",
  "The view has no model",
);
const noModel = (): ViewCommandOutcome => err(NO_MODEL);
const UNBOUND_VIEW: ViewCommands = {
  fitAll: noModel,
  fitSelection: noModel,
  resetView: noModel,
  reveal: noModel,
};

function hoverId(hit: HitCandidate | undefined): string | undefined {
  if (!hit) return undefined;
  return hit.kind === "connection" ? hit.connectionId : hit.nodeId;
}

function removedIds(
  ops: ReadonlyArray<{ op: string; record?: { id: string } }>,
): string[] {
  return ops.flatMap((o) =>
    o.op === "remove" && o.record ? [o.record.id] : [],
  );
}

export function attachEditing(deps: EditingDeps): Editing {
  const { model, scene, selection, viewport } = deps;
  const editable: EditableModel | undefined =
    model && isEditable(model) ? model : undefined;
  const reader: GraphReader | undefined = model?.reader;
  const view =
    reader && scene
      ? createViewCommands({
          reader,
          scene,
          selection,
          viewport: { get: viewport.get, set: viewport.set },
          size: deps.size,
        })
      : UNBOUND_VIEW;
  const commands = createCommandRegistry(() => ({
    model: editable,
    reader,
    selection,
    view,
  }));
  registerBuiltinCommands(commands);

  const offs: Array<() => void> = [];
  let input: DomInput | undefined;
  // One object per change, so the tool context re-resolves only after `setToolOptions`.
  let toolOptions: Partial<ToolOptions> =
    (deps.input !== false && deps.input?.toolOptions) || {};
  if (deps.input !== false && model && reader && scene) {
    const options = deps.input ?? {};
    const platform =
      options.platform ??
      detectPlatform(deps.root.ownerDocument.defaultView?.navigator);
    const keymap = createKeymap(platform, options.keymap ?? DEFAULT_KEYMAP);
    const router = createToolRouter(options.tools ?? defaultToolSlots());
    const context = createToolContext({
      reader,
      scene,
      selection,
      viewport: viewport.get,
      can: editable
        ? capabilityProbe(editable)
        : () => ({ available: false, reason: NO_MODEL }),
      ...(editable ? { plan: editable.plan } : {}),
      options: () => toolOptions,
    });
    input = attachDomInput(deps.root, {
      router,
      context,
      overlay: deps.overlay,
      platform,
      host: {
        preview: deps.setPreview,
        commit: (command) => void editable?.execute(command),
        selection,
        viewport(op) {
          if (op.kind === "panBy") viewport.panBy(op.dx, op.dy);
          else if (op.kind === "zoomAt") viewport.zoomAt(op.anchor, op.factor);
          else viewport.set(op.viewport);
        },
      },
      coords(clientX, clientY) {
        const v = viewport.clientToViewport(clientX, clientY);
        const w = viewport.clientToWorld(clientX, clientY);
        return v.ok && w.ok ? { viewport: v.value, world: w.value } : undefined;
      },
      onKey(event) {
        const resolved = keymap.resolve(event, toolOptions.gridStep ?? 1);
        if (!resolved) return false;
        commands.run(resolved.command, resolved.args);
        return true;
      },
      onHover: (hit) => deps.setHovered(hoverId(hit)),
    });
    const live = input;
    offs.push(
      model.on("change", (e) => live.entitiesRemoved(removedIds(e.patch.ops))),
    );
  }

  return {
    commands,
    toolOptions: () => resolveToolOptions(toolOptions),
    setToolOptions(patch) {
      toolOptions = { ...toolOptions, ...patch };
    },
    dispose() {
      for (const off of offs.splice(0)) off();
      input?.dispose();
      input = undefined;
    },
  };
}
