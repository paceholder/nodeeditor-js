/**
 * Editor command registry (D9). Commands have stable IDs and are the single path
 * for shortcuts, the API and (later) menus, so every route produces identical patches.
 * Failures that callers can expect come back as results; nothing here throws for them.
 */
import {
  type Availability,
  type ExecuteResult,
  err,
  type GraphReader,
  type GroupId,
  ok,
  type Point,
  type Rejection,
  type Result,
  rejectionOf,
  type SubmitResult,
} from "../../../core/index.js";
import { VIEW_LOCKED } from "../lock/view-lock.js";
import type { SelectionModel } from "../selection/selection-model.js";
import type { EditableModel } from "./editable-model.js";
import type { ViewCommands } from "./view-commands.js";

/** `changed: false` is a successful no-op. */
export type CommandOutcome = Result<{ readonly changed: boolean }, Rejection>;

/** A model result as a command outcome: accepted changes, queued or pending do not. */
export function outcomeOf(
  result: ExecuteResult | SubmitResult,
): CommandOutcome {
  switch (result.status) {
    case "accepted":
      return ok({ changed: true });
    case "rejected":
      return err(result.rejection);
    case "queued":
    case "pending":
      return ok({ changed: false });
    case "choice-required":
      return err(rejectionOf("choice-required", "A choice is required"));
    case "unverified":
      return err(rejectionOf("pending-validation", result.reason));
  }
}

export interface CommandContext {
  /** Absent when the view shows a read-only model. */
  readonly model: EditableModel | undefined;
  /** Reads for selection commands; present whenever the view is bound to a model. */
  readonly reader: GraphReader | undefined;
  readonly selection: SelectionModel;
  readonly view: ViewCommands;
  /**
   * Open the title editor of a group (or raise the event a host editor answers); returns
   * whether it opened. Absent when the view takes no input.
   */
  readonly editGroupTitle?: (group: GroupId) => boolean;
  /**
   * World position of a mouse or pen pointer over the view, the point the built-in paste
   * centres on. Absent once the pointer has left the view, for touch, and without input.
   */
  readonly pointer?: Point<"world">;
}

export interface EditorCommand<A = void> {
  readonly id: string;
  /** Localizable key, never a translated string. */
  readonly labelKey: string;
  /**
   * True for commands that work while the view is locked (selection, view and copy
   * commands). Any other command is refused with the lock reason.
   */
  readonly allowWhenLocked?: boolean;
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
  locked: () => boolean = () => false,
  /** Called after a command is registered, replaced or removed. */
  changed: () => void = () => {},
): CommandRegistry {
  // Args are erased at the registry boundary; each command validates its own.
  const commands = new Map<string, EditorCommand<unknown>>();
  return {
    register(command) {
      const stored = command as EditorCommand<unknown>;
      commands.set(command.id, stored);
      changed();
      return () => {
        if (commands.get(command.id) !== stored) return;
        commands.delete(command.id);
        changed();
      };
    },
    run(id, args) {
      const command = commands.get(id);
      if (!command) return err(unknownCommand(id));
      if (locked() && !command.allowWhenLocked) return err(VIEW_LOCKED);
      const ctx = context();
      const availability = command.availability(args, ctx);
      return availability.available
        ? command.run(args, ctx)
        : err(availability.rejection);
    },
    availability(id, args) {
      const command = commands.get(id);
      if (!command) return { available: false, rejection: unknownCommand(id) };
      return locked() && !command.allowWhenLocked
        ? { available: false, rejection: VIEW_LOCKED }
        : command.availability(args, context());
    },
    list: () =>
      [...commands.values()].map(({ id, labelKey }) => ({ id, labelKey })),
  };
}

export const NOTHING_CHANGED: CommandOutcome = ok({ changed: false });
