/**
 * Clipboard editor commands (INT-07, UX-01, EDT-03, EDT-06, MOD-11): edit.copy,
 * edit.cut, edit.paste and edit.duplicate over the view's clipboard service. Shortcuts,
 * native clipboard events and API calls all run these, so every route gives the same
 * patch. Availability explains each refusal.
 */
import {
  type Availability,
  err,
  ok,
  type Rejection,
  type Result,
  rejectionOf,
} from "../../../core/index.js";
import type {
  CommandContext,
  CommandOutcome,
  CommandRegistry,
  EditorCommand,
} from "../commands/command-registry.js";
import type { ClipboardService, TextSink } from "./clipboard-service.js";

export const CLIPBOARD_COMMAND_IDS = {
  copy: "edit.copy",
  cut: "edit.cut",
  paste: "edit.paste",
  duplicate: "edit.duplicate",
} as const;

/** Arguments of edit.copy and edit.cut: the native event's text sink, if any. */
export interface CopyArgs {
  readonly sink?: TextSink;
}

/** Arguments of edit.paste: text from a native paste event; the buffer otherwise. */
export interface PasteArgs {
  readonly text?: string;
}

const OK: Availability = { available: true };

function needNode(ctx: CommandContext): Availability {
  if (!ctx.reader) {
    return {
      available: false,
      reason: rejectionOf("unknown-entity", "The view has no model"),
    };
  }
  return ctx.selection.nodeIds().length > 0
    ? OK
    : {
        available: false,
        reason: rejectionOf("empty-fragment", "Select at least one node"),
      };
}

const changed = (
  r: Result<unknown, Rejection>,
  yes: boolean,
): CommandOutcome => (r.ok ? ok({ changed: yes }) : err(r.error));

function command<A>(
  id: string,
  availability: (args: A, ctx: CommandContext) => Availability,
  run: (args: A) => CommandOutcome,
): EditorCommand<A> {
  return {
    id,
    labelKey: `command.${id}`,
    availability,
    run: (args) => run(args),
  };
}

export function registerClipboardCommands(
  registry: CommandRegistry,
  service: ClipboardService,
): void {
  registry.register(
    command<CopyArgs | undefined>(
      CLIPBOARD_COMMAND_IDS.copy,
      (_args, ctx) => needNode(ctx),
      (args) => changed(service.copy(args?.sink), false),
    ),
  );
  registry.register(
    command<CopyArgs | undefined>(
      CLIPBOARD_COMMAND_IDS.cut,
      (_args, ctx) => {
        const has = needNode(ctx);
        if (!has.available) return has;
        if (!ctx.model) {
          return {
            available: false,
            reason: rejectionOf(
              "unknown-entity",
              "The view has no editable model",
            ),
          };
        }
        return ctx.model.can({
          kind: "deleteEntities",
          nodes: ctx.selection.nodeIds(),
          connections: ctx.selection.connectionIds(),
        });
      },
      (args) => changed(service.cut(args?.sink), true),
    ),
  );
  registry.register(
    command<PasteArgs | undefined>(
      CLIPBOARD_COMMAND_IDS.paste,
      // Native paste text is tried as is: `run` reports foreign text as not-a-fragment.
      (args, ctx) =>
        args?.text !== undefined && ctx.model ? OK : service.canPaste(),
      (args) => changed(service.paste(args?.text), true),
    ),
  );
  registry.register(
    command<void>(
      CLIPBOARD_COMMAND_IDS.duplicate,
      () => service.canDuplicate(),
      () => changed(service.duplicate(), true),
    ),
  );
}
