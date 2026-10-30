/**
 * Editor command registry (D9). Commands have stable IDs and are the single path
 * for shortcuts, the API and (later) menus, so every route produces identical patches.
 * Failures that callers can expect come back as results; nothing here throws for them.
 */
import {
  type Availability,
  err,
  type GraphReader,
  ok,
  type Rejection,
  type Result,
  rejectionOf,
} from "../../../core/index.js";
import type { SelectionModel } from "../selection/selection-model.js";
import type { EditableModel } from "./editable-model.js";
import type { ViewCommands } from "./view-commands.js";

/** `changed: false` is a successful no-op. */
export type CommandOutcome = Result<{ readonly changed: boolean }, Rejection>;

export interface CommandContext {
  /** Absent when the view shows a read-only model. */
  readonly model: EditableModel | undefined;
  /** Reads for selection commands; present whenever the view is bound to a model. */
  readonly reader: GraphReader | undefined;
  readonly selection: SelectionModel;
  readonly view: ViewCommands;
}

export interface EditorCommand<A = void> {
  readonly id: string;
  /** Localizable key, never a translated string. */
  readonly labelKey: string;
  availability(args: A, ctx: CommandContext): Availability;
  run(args: A, ctx: CommandContext): CommandOutcome;
}

export interface CommandInfo {
  readonly id: string;
  readonly labelKey: string;
}

export interface CommandRegistry {
  /** Returns the remover. A duplicate ID replaces the earlier registration. */
  register<A>(command: EditorCommand<A>): () => void;
  run(id: string, args?: unknown): CommandOutcome;
  availability(id: string, args?: unknown): Availability;
  /** Registered commands in registration order. */
  list(): readonly CommandInfo[];
}

const unknownCommand = (id: string): Rejection =>
  rejectionOf("unknown-entity", `Unknown command "${id}"`, [id]);

export function createCommandRegistry(
  context: () => CommandContext,
): CommandRegistry {
  // Args are erased at the registry boundary; each command validates its own.
  const commands = new Map<string, EditorCommand<unknown>>();
  return {
    register(command) {
      const stored = command as EditorCommand<unknown>;
      commands.set(command.id, stored);
      return () => {
        if (commands.get(command.id) === stored) commands.delete(command.id);
      };
    },
    run(id, args) {
      const command = commands.get(id);
      if (!command) return err(unknownCommand(id));
      const ctx = context();
      const availability = command.availability(args, ctx);
      return availability.available
        ? command.run(args, ctx)
        : err(availability.reason);
    },
    availability(id, args) {
      const command = commands.get(id);
      return command
        ? command.availability(args, context())
        : { available: false, reason: unknownCommand(id) };
    },
    list: () =>
      [...commands.values()].map(({ id, labelKey }) => ({ id, labelKey })),
  };
}

export const NOTHING_CHANGED: CommandOutcome = ok({ changed: false });
