/**
 * Per-view clipboard service (D8, D9).
 *
 * Holds the in-app fragment buffer and the paste counter, and runs copy, cut, paste and
 * duplicate against the model. Text written to the system clipboard is the same fragment
 * text, so pasting into another tab works; the in-app buffer and `exportText` /
 * `importText` keep working when the browser denies clipboard access. The system
 * clipboard is injected (`undefined` in headless tests), so nothing here reads
 * `navigator`. Each view owns one service; nothing is shared.
 */
import {
  type Command,
  err,
  extractFragment,
  type FragmentParseOptions,
  fragmentToText,
  ok,
  type Placement,
  parseFragmentText,
  rejectionOf,
} from "../../../core/index.js";
import { LOCKED, VIEW_LOCKED } from "../lock/view-lock.js";
import { connectionKey, nodeKey } from "../selection/selection-model.js";
import type {
  ClipboardEventMap,
  ClipboardService,
  ClipboardServiceDeps,
  CopyOutcome,
  CopyReport,
  PasteOutcome,
  TextSink,
} from "./clipboard-types.js";
import { executeAndSelect } from "./paste-commit.js";
import {
  copiedPlacement,
  DEFAULT_PASTE_STEP,
  duplicatePlacement,
  INITIAL_PLACEMENT,
  type PlacementState,
  pastePlacement,
} from "./placement.js";

const NO_MODEL = rejectionOf(
  "unknown-entity",
  "The view has no editable model",
);
const EMPTY = rejectionOf(
  "not-a-fragment",
  "The clipboard holds no graph fragment",
);

export function createClipboardService(
  deps: ClipboardServiceDeps,
): ClipboardService {
  const { reader, model, selection } = deps;
  const step = deps.options?.step ?? DEFAULT_PASTE_STEP;
  const external = deps.options?.external ?? "exclude";
  const parseOptions: FragmentParseOptions = {
    ...(deps.codecs ? { codecs: deps.codecs } : {}),
    ...(deps.limits ? { limits: deps.limits } : {}),
  };
  const handlers = new Map<string, Set<(event: never) => void>>();
  let buffer: string | undefined;
  let placement: PlacementState = INITIAL_PLACEMENT;
  let disposed = false;

  const emit = <K extends keyof ClipboardEventMap>(
    type: K,
    event: ClipboardEventMap[K],
  ): void => {
    for (const h of [...(handlers.get(type) ?? [])]) {
      (h as (e: ClipboardEventMap[K]) => void)(event);
    }
  };

  function extract(): CopyOutcome {
    const r = extractFragment(
      reader,
      { nodes: selection.nodeIds(), connections: selection.connectionIds() },
      parseOptions,
    );
    if (!r.ok) return r;
    return ok({
      text: fragmentToText(r.value.fragment),
      excluded: r.value.excluded,
    });
  }

  function write(report: CopyReport, sink: TextSink | undefined): void {
    buffer = report.text;
    placement = copiedPlacement(report.text);
    deps.bufferChanged?.();
    if (sink) {
      sink(report.text);
      return;
    }
    if (!deps.system) return;
    deps.system.writeText(report.text).catch((e: unknown) => {
      if (disposed) return;
      emit(
        "clipboard-error",
        rejectionOf(
          "clipboard-unavailable",
          `The system clipboard refused the copy: ${e instanceof Error ? e.message : String(e)}`,
        ),
      );
    });
  }

  const isLocked = (): boolean => deps.locked?.() === true;

  function commit(command: Command): PasteOutcome {
    if (isLocked()) return err(VIEW_LOCKED);
    if (!model) return err(NO_MODEL);
    return executeAndSelect(model, command, {
      select: (created) =>
        selection.replace([
          ...created.nodes.map(nodeKey),
          ...created.connections.map(connectionKey),
        ]),
      // The paste was reported pending; its final refusal is a second report.
      refused: (rejection) => {
        if (!disposed) emit("paste", err(rejection));
      },
    });
  }

  function pasteText(text: string, at?: Placement): PasteOutcome {
    if (isLocked()) return err(VIEW_LOCKED);
    if (!model) return err(NO_MODEL);
    const parsed = parseFragmentText(text, parseOptions);
    if (!parsed.ok) {
      const [first] = parsed.rejection;
      return err(
        first ? rejectionOf(first.code, first.message, first.entities) : EMPTY,
      );
    }
    const next = pastePlacement(placement, text, deps.pointer(), step);
    const outcome = commit({
      kind: "paste",
      fragment: parsed.value,
      placement: at ?? next.placement,
      external,
    });
    if (outcome.ok) placement = next.next;
    return outcome;
  }

  const reported = (outcome: PasteOutcome): PasteOutcome => {
    emit("paste", outcome);
    return outcome;
  };

  return {
    copy(sink) {
      const r = extract();
      if (r.ok) {
        write(r.value, sink);
        emit("copy", r.value);
      }
      return r;
    },
    cut(sink) {
      if (isLocked()) return err(VIEW_LOCKED);
      if (!model) return err(NO_MODEL);
      const r = extract();
      if (!r.ok) return r;
      const result = model.execute({
        kind: "deleteEntities",
        nodes: selection.nodeIds(),
        connections: selection.connectionIds(),
      });
      if (result.status === "rejected") return err(result.rejection);
      if (result.status === "choice-required" || result.status === "unverified")
        return err(
          rejectionOf("pending-validation", "The delete was not applied"),
        );
      write(r.value, sink);
      emit("cut", r.value);
      return r;
    },
    paste: (text, at) =>
      reported(
        text !== undefined
          ? pasteText(text, at)
          : buffer !== undefined
            ? pasteText(buffer, at)
            : err(EMPTY),
      ),
    duplicate: () =>
      reported(
        commit({
          kind: "duplicate",
          nodes: selection.nodeIds(),
          placement: duplicatePlacement(step),
          external,
        }),
      ),
    exportText() {
      const r = extract();
      return r.ok ? ok(r.value.text) : r;
    },
    importText: (text, at) => reported(pasteText(text, at)),
    async pasteFromSystem() {
      if (!deps.system) {
        return reported(
          err(rejectionOf("clipboard-unavailable", "No system clipboard")),
        );
      }
      let text: string;
      try {
        text = await deps.system.readText();
      } catch (e) {
        return reported(
          err(
            rejectionOf(
              "clipboard-unavailable",
              `The browser refused to read the clipboard: ${e instanceof Error ? e.message : String(e)}`,
            ),
          ),
        );
      }
      return disposed ? err(NO_MODEL) : reported(pasteText(text));
    },
    buffer: () => buffer,
    canPaste(text) {
      if (isLocked()) return LOCKED;
      if (!model) return { available: false, rejection: NO_MODEL };
      const source = text ?? buffer;
      if (source === undefined) return { available: false, rejection: EMPTY };
      const parsed = parseFragmentText(source, parseOptions);
      if (!parsed.ok) {
        const [first] = parsed.rejection;
        return {
          available: false,
          rejection: first
            ? rejectionOf(first.code, first.message, first.entities)
            : EMPTY,
        };
      }
      return model.can({
        kind: "paste",
        fragment: parsed.value,
        placement: pastePlacement(placement, source, deps.pointer(), step)
          .placement,
        external,
      });
    },
    canDuplicate() {
      if (isLocked()) return LOCKED;
      if (!model) return { available: false, rejection: NO_MODEL };
      const nodes = selection.nodeIds();
      if (nodes.length === 0) {
        return {
          available: false,
          rejection: rejectionOf("empty-fragment", "Select at least one node"),
        };
      }
      return model.can({
        kind: "duplicate",
        nodes,
        placement: duplicatePlacement(step),
        external,
      });
    },
    on(type, handler) {
      const set = handlers.get(type) ?? new Set();
      handlers.set(type, set);
      set.add(handler as (event: never) => void);
      return () => void set.delete(handler as (event: never) => void);
    },
    dispose() {
      disposed = true;
      handlers.clear();
      buffer = undefined;
    },
  };
}

export type {
  ClipboardEventMap,
  ClipboardOptions,
  ClipboardService,
  ClipboardServiceDeps,
  CopyOutcome,
  CopyReport,
  PasteOutcome,
  PasteReport,
  SystemClipboard,
  TextSink,
} from "./clipboard-types.js";
