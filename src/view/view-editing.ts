/**
 * Editing wiring for a mounted view (D10): selection, the command
 * registry, tool routing and the DOM input adapter, built over the view's scene and
 * viewport. `mountView` owns the lifetime; this module owns nothing global.
 */
import {
  type Command,
  err,
  type GeometryScene,
  type GraphReader,
  type PlanResult,
  type Rejection,
  type RouteRegistry,
  rejectionOf,
} from "../core/index.js";
import {
  attachClipboardEvents,
  type ClipboardEvents,
} from "./interact/clipboard/clipboard-events.js";
import {
  type ClipboardService,
  createClipboardService,
} from "./interact/clipboard/clipboard-service.js";
import {
  fragmentOptionsOf,
  systemClipboardOf,
  UNBOUND_CLIPBOARD,
  type ViewClipboard,
} from "./interact/clipboard/view-clipboard.js";
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
import {
  DEFAULT_FIT_MAX_ZOOM,
  type FitOptions,
} from "./interact/commands/view-fit.js";
import {
  createZoomCommands,
  type ZoomCommands,
} from "./interact/commands/zoom-commands.js";
import type { ViewEventMap } from "./interact/context-menu/context-menu-types.js";
import {
  createHoverTracker,
  type HoverTracker,
} from "./interact/hover/hover-tracker.js";
import type { HoverTarget } from "./interact/hover/hover-types.js";
import { attachDomInput, type DomInput } from "./interact/input/dom-input.js";
import {
  createViewEvents,
  type ViewEvents,
} from "./interact/input/view-events.js";
import {
  createViewLock,
  LOCKED,
  VIEW_LOCKED,
} from "./interact/lock/view-lock.js";
import type { SelectionModel } from "./interact/selection/selection-model.js";
import { defaultToolSlots } from "./interact/tools/default-tools.js";
import { createResizeHandles } from "./interact/tools/resize-handles.js";
import { routeCursorAt } from "./interact/tools/route-edit-tool.js";
import {
  resolveToolOptions,
  type ToolOptions,
} from "./interact/tools/thresholds.js";
import {
  capabilityProbe,
  createToolContext,
  sizeLimitsOf,
} from "./interact/tools/tool-context.js";
import { createToolRouter } from "./interact/tools/tool-router.js";
import type { ToolPreview } from "./interact/tools/tool-types.js";
import type { FrameClock } from "./platform/frame-scheduler.js";
import { removedIds, type ViewModel } from "./platform/model-binding.js";
import type { ViewRect } from "./platform/view-rect.js";
import type { ViewportState } from "./platform/viewport-state.js";
import type { ResolvedZoomLimits } from "./platform/zoom-limits.js";
import type { InteractionLayer } from "./render/paint/interaction-layer.js";
import { rerouteEntry } from "./render/paint/previews/ghost-entries.js";
import type { RouteEditorRegistry } from "./render/registries/route-editor-registry.js";
import {
  attachViewConnectionChoice,
  type ViewConnectionChoice,
} from "./view-connection-choice.js";
import {
  createViewContextMenu,
  type ViewContextMenu,
} from "./view-context-menu.js";
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
  /** The active tool preview, for the resize handle. */
  readonly preview: () => ToolPreview | null;
  readonly interaction: Pick<InteractionLayer, "add" | "invalidate">;
  /** The view's frame clock; auto-pan requests its frames here. */
  readonly clock: FrameClock;
  readonly setHovered: (id: string | undefined) => void;
  /** The node's body bounds in client pixels; used by hover events. */
  readonly nodeRect: (id: string) => ViewRect | undefined;
  /** `false` keeps selection and commands but attaches no DOM listeners. */
  readonly input: false | InputOptions;
  readonly routeEditors: Pick<RouteEditorRegistry, "get">;
  /** Routers per connection kind; route editors re-route through them. */
  readonly routes: Pick<RouteRegistry, "get">;
  /** Current port-hiding zoom of the theme. */
  readonly hidePortsBelow: () => number;
  /** The view's zoom range, read on every use because it can change at runtime. */
  readonly zoomLimits: ResolvedZoomLimits;
  /** Start locked. */
  readonly locked: boolean;
}

export interface Editing {
  readonly commands: CommandRegistry;
  readonly clipboard: ViewClipboard;
  readonly on: ViewContextMenu["on"];
  /** Raise a view event for the mount code that owns its source (viewport, selection). */
  readonly emit: ViewEvents<ViewEventMap>["emit"];
  /** The view lock: editing gestures and commands are refused while it is on. */
  locked(): boolean;
  setLocked(locked: boolean): void;
  /** The hovered entity, or null. Always null without editing input. */
  hover(): HoverTarget | null;
  /** Recompute the hover from the last pointer position (the view moved under it). */
  refreshHover(): void;
  /** Replace or remove the connection chooser; cancels a pending choice. */
  readonly setConnectionChooser: ViewConnectionChoice["setChooser"];
  toolOptions(): ToolOptions;
  setToolOptions(
    patch: Partial<ToolOptions>,
    opts?: { readonly replace?: boolean },
  ): void;
  /** Fit all content once with the given padding and cap. */
  fitAll(opts: FitOptions): ViewCommandOutcome;
  /** True while something on the interaction layer is drawn in world space. */
  interactionFollowsViewport(): boolean;
  dispose(): void;
}

const NO_MODEL: Rejection = rejectionOf(
  "unknown-entity",
  "The view has no model",
);
const noModel = (): ViewCommandOutcome => err(NO_MODEL);
/** Fit and reveal need a model; zooming does not, so it is added where the view is built. */
const UNBOUND_VIEW: Omit<ViewCommands, keyof ZoomCommands> = {
  fitAll: noModel,
  fitSelection: noModel,
  resetView: noModel,
  reveal: noModel,
};

/** The ID painters see as hovered: a port counts as its node. */
function hoverId(target: HoverTarget | null): string | undefined {
  if (!target) return undefined;
  return target.kind === "connection" ? target.connection : target.node;
}

export function attachEditing(deps: EditingDeps): Editing {
  const { model, scene, selection, viewport } = deps;
  const lock = createViewLock(deps.locked);
  const editable: EditableModel | undefined =
    model && isEditable(model) ? model : undefined;
  const reader: GraphReader | undefined = model?.reader;
  // Fit stays inside the view's zoom limits.
  const zoomLimits = (): { min: number; max: number } => ({
    min: deps.zoomLimits.min,
    max: deps.zoomLimits.max,
  });
  const fitWith = (opts: FitOptions): ViewCommands =>
    reader && scene
      ? createViewCommands({
          reader,
          scene,
          selection,
          viewport: { get: viewport.get, set: viewport.set },
          size: deps.size,
          zoomLimits,
          options: {
            ...opts,
            minZoom: deps.zoomLimits.min,
            maxZoom: Math.min(
              opts.maxZoom ?? DEFAULT_FIT_MAX_ZOOM,
              deps.zoomLimits.max,
            ),
          },
        })
      : {
          ...UNBOUND_VIEW,
          ...createZoomCommands({
            viewport: { get: viewport.get, set: viewport.set },
            size: deps.size,
            limits: zoomLimits,
          }),
        };
  // The fit commands carry the zoom range they were built with: rebuilt when it changes.
  let fitCommands = { min: NaN, max: NaN, commands: fitWith({}) };
  const currentView = (): ViewCommands => {
    const { min, max } = deps.zoomLimits;
    if (fitCommands.min !== min || fitCommands.max !== max) {
      fitCommands = { min, max, commands: fitWith({}) };
    }
    return fitCommands.commands;
  };
  const commands = createCommandRegistry(
    () => ({ model: editable, reader, selection, view: currentView() }),
    lock.get,
    () => events.emit("availability", { cause: "commands" }),
  );
  const offs: Array<() => void> = [];
  const events = createViewEvents<ViewEventMap>();
  const menu = createViewContextMenu(deps.root, events);
  let hover: HoverTracker | undefined;
  let input: DomInput | undefined;
  let choices: ViewConnectionChoice | undefined;
  let bridge: ClipboardEvents | undefined;
  let handles: ReturnType<typeof createResizeHandles> | undefined;
  const clipOptions = deps.input === false ? undefined : deps.input?.clipboard;
  const clipboard: ClipboardService | undefined = reader
    ? createClipboardService({
        reader,
        model: editable,
        selection,
        locked: lock.get,
        bufferChanged: () =>
          events.emit("availability", { cause: "clipboard" }),
        pointer: () => input?.pointerWorld(),
        system:
          clipOptions?.system === false
            ? undefined
            : systemClipboardOf(deps.root),
        ...(clipOptions ? { options: clipOptions } : {}),
        ...fragmentOptionsOf(model),
      })
    : undefined;
  registerBuiltinCommands(commands, clipboard);
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
    const sizeLimits = sizeLimitsOf(model);
    const probe = editable
      ? capabilityProbe({
          reader,
          can: (command) => editable.can(command),
          ...(sizeLimits ? { sizeLimits } : {}),
        })
      : () => ({ available: false, reason: NO_MODEL });
    // While locked no editing action is available and no edit can be planned, so no tool
    // starts or finishes one; locking also ends gestures and cancels a pending choice, so
    // nothing planned earlier arrives late.
    const can: typeof probe = (action, id) =>
      lock.get() ? LOCKED : probe(action, id);
    const commit = (command: Command): void => void editable?.execute(command);
    const context = createToolContext({
      reader,
      scene,
      selection,
      viewport: viewport.get,
      can,
      ...(sizeLimits ? { sizeLimits } : {}),
      ...(editable
        ? {
            plan: (command: Command): PlanResult =>
              lock.get()
                ? { kind: "rejected", error: VIEW_LOCKED }
                : editable.plan(command),
          }
        : {}),
      options: () => toolOptions,
      hidePortsBelow: deps.hidePortsBelow,
      zoomRange: deps.zoomLimits,
      chooserInstalled: () => choices?.installed() === true,
      routeEditors: {
        get: (kind) => (lock.get() ? undefined : deps.routeEditors.get(kind)),
      },
      reroute: (entry, route) =>
        rerouteEntry(entry, route, { reader, scene, routes: deps.routes }),
    });
    handles = editable
      ? createResizeHandles({
          model,
          scene,
          selection,
          can,
          zoom: () => viewport.get().zoom,
          preview: deps.preview,
          interaction: deps.interaction,
        })
      : undefined;
    const live = handles;
    input = attachDomInput(deps.root, {
      router,
      context,
      overlay: deps.overlay,
      platform,
      host: {
        preview: deps.setPreview,
        commit,
        choose: (release) => choices?.open(release),
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
        // Clipboard chords: the browser's copy/cut/paste event runs the command.
        if (resolved.native && bridge) return "native";
        commands.run(resolved.command, resolved.args);
        return true;
      },
      hover: {
        move: (x, y) => hover?.move(x, y),
        leave: () => hover?.leave(),
        gestureEnded: () => hover?.gestureEnded(),
      },
      hoverCursor: (world) =>
        live?.cursorAt(world) ?? routeCursorAt(world, context()),
      autoPan: { clock: deps.clock, size: deps.size },
    });
    if (clipboard) {
      bridge = attachClipboardEvents(deps.root, {
        run: commands.run,
        overlay: deps.overlay,
      });
    }
    hover = createHoverTracker({
      pickAt(clientX, clientY) {
        const world = viewport.clientToWorld(clientX, clientY);
        return world.ok ? context().pick(world.value) : [];
      },
      nodeRect: deps.nodeRect,
      gesture: () => router.activePointer !== undefined,
      clock: deps.clock,
      emit(event) {
        deps.setHovered(hoverId(event.target));
        events.emit("hover", event);
      },
    });
    const dom = input;
    choices = attachViewConnectionChoice(deps.root, {
      model,
      overlay: deps.overlay,
      viewport,
      commit,
      clearPreview: () => deps.setPreview(null),
      chooser: options.chooseConnection,
    });
    menu.attach({
      overlay: deps.overlay,
      platform,
      context,
      selection,
      size: deps.size,
      activePointer: () => router.activePointer,
      cancelGesture: dom.cancelGesture,
    });
    offs.push(
      model.on("change", (e) => {
        const removed = removedIds(e.patch.ops);
        dom.entitiesRemoved(removed);
        hover?.entitiesRemoved(removed);
      }),
      model.on("reset", () => {
        dom.modelReset();
        hover?.modelReset();
      }),
    );
  }

  return {
    commands,
    clipboard: clipboard ?? UNBOUND_CLIPBOARD,
    on: menu.on,
    emit: events.emit,
    locked: lock.get,
    setLocked(next) {
      if (!lock.set(next)) return;
      if (next) {
        // An open gesture ends with the lock: nothing it was about to do may commit.
        // Unlocking cancels nothing, so a pan or marquee in progress carries on.
        input?.cancelGesture("escape");
        choices?.cancel();
        deps.setPreview(null);
      }
      events.emit("lock", { locked: next });
    },
    hover: () => hover?.current() ?? null,
    refreshHover: () => hover?.refresh(),
    setConnectionChooser: (chooser) => choices?.setChooser(chooser),
    toolOptions: () => resolveToolOptions(toolOptions),
    setToolOptions(patch, opts) {
      toolOptions = opts?.replace ? { ...patch } : { ...toolOptions, ...patch };
    },
    fitAll: (opts) => fitWith(opts).fitAll(),
    interactionFollowsViewport: () => handles?.visible() === true,
    dispose() {
      for (const off of offs.splice(0)) off();
      menu.dispose();
      hover?.dispose();
      hover = undefined;
      events.clear();
      choices?.dispose();
      bridge?.dispose();
      bridge = undefined;
      input?.dispose();
      input = undefined;
      handles?.dispose();
      handles = undefined;
      clipboard?.dispose();
    },
  };
}
