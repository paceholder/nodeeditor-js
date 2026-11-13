/**
 * Group editor commands: group.create puts the selected nodes into one new group,
 * selects it and opens its title editor; group.ungroup removes the selected groups and
 * the groups of the selected nodes; group.rename renames the one selected group, or
 * opens its title editor when no title is given. Each edit is one model command, so a
 * shortcut and an API call give identical patches.
 */
import {
  type Availability,
  type Command,
  err,
  type GroupId,
  ok,
  type Rejection,
  rejectionOf,
} from "../../../core/index.js";
import { deepFreeze } from "../../platform/deep-freeze.js";
import { groupKey } from "../selection/selection-model.js";
import {
  type CommandContext,
  type CommandOutcome,
  type CommandRegistry,
  type EditorCommand,
  outcomeOf,
} from "./command-registry.js";

export const GROUP_COMMAND_IDS = deepFreeze({
  group: "group.create",
  ungroup: "group.ungroup",
  renameGroup: "group.rename",
} as const);

export interface GroupArgs {
  /** Title of the new group; the model's default when omitted. */
  readonly title?: string;
  readonly style?: string;
}

export interface RenameGroupArgs {
  /** The new title. Omitted: open the title editor instead. */
  readonly title?: string;
}

type Planned<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly rejection: Rejection };

const refuse = (
  code: Parameters<typeof rejectionOf>[0],
  message: string,
): { readonly ok: false; readonly rejection: Rejection } => ({
  ok: false,
  rejection: rejectionOf(code, message),
});

const NO_MODEL = refuse("unknown-entity", "The view has no editable model");

function planGroup(
  ctx: CommandContext,
  args: GroupArgs | undefined,
): Planned<Extract<Command, { kind: "groupNodes" }>> {
  if (!ctx.model) return NO_MODEL;
  const nodes = ctx.selection.nodeIds();
  if (nodes.length === 0) return refuse("nothing-to-do", "No node is selected");
  return {
    ok: true,
    value: {
      kind: "groupNodes",
      nodes,
      ...(args?.title === undefined ? {} : { title: args.title }),
      ...(args?.style === undefined ? {} : { style: args.style }),
    },
  };
}

/** The selected groups and the groups of the selected nodes, in document order. */
function groupsOfSelection(ctx: CommandContext): GroupId[] {
  const reader = ctx.reader;
  if (!reader) return [];
  const wanted = new Set<GroupId>(ctx.selection.groupIds());
  for (const id of ctx.selection.nodeIds()) {
    const group = reader.getNode(id)?.group;
    if (group !== undefined) wanted.add(group);
  }
  return reader
    .groups()
    .map((g) => g.id)
    .filter((id) => wanted.has(id));
}

function planUngroup(
  ctx: CommandContext,
): Planned<Extract<Command, { kind: "ungroup" }>> {
  if (!ctx.model) return NO_MODEL;
  const groups = groupsOfSelection(ctx);
  return groups.length === 0
    ? refuse("nothing-to-do", "No group is selected")
    : { ok: true, value: { kind: "ungroup", groups } };
}

/** The one selected group, the thing F2 renames. */
function soleGroup(ctx: CommandContext): Planned<GroupId> {
  if (!ctx.model) return NO_MODEL;
  const [group, ...more] = ctx.selection.groupIds();
  return group === undefined || more.length > 0
    ? refuse("nothing-to-do", "Select exactly one group to rename")
    : { ok: true, value: group };
}

const availabilityOf = (
  ctx: CommandContext,
  planned: Planned<Command>,
): Availability =>
  planned.ok
    ? (ctx.model?.can(planned.value) ?? {
        available: false,
        rejection: NO_MODEL.rejection,
      })
    : { available: false, rejection: planned.rejection };

const groupCommand: EditorCommand<GroupArgs | undefined> = {
  id: GROUP_COMMAND_IDS.group,
  labelKey: `command.${GROUP_COMMAND_IDS.group}`,
  availability: (args, ctx) => availabilityOf(ctx, planGroup(ctx, args)),
  run(args, ctx): CommandOutcome {
    const planned = planGroup(ctx, args);
    if (!planned.ok || !ctx.model) return err(NO_MODEL.rejection);
    const result = ctx.model.execute(planned.value);
    const outcome = outcomeOf(result);
    if (!outcome.ok) return outcome;
    // Shown at once even while a host's answer is pending: read the group back.
    const first = planned.value.nodes[0];
    const created = first && ctx.reader?.getNode(first)?.group;
    if (created !== undefined) {
      ctx.selection.replace([groupKey(created)]);
      ctx.editGroupTitle?.(created);
    }
    return outcome;
  },
};

const ungroupCommand: EditorCommand = {
  id: GROUP_COMMAND_IDS.ungroup,
  labelKey: `command.${GROUP_COMMAND_IDS.ungroup}`,
  availability: (_args, ctx) => availabilityOf(ctx, planUngroup(ctx)),
  run(_args, ctx) {
    const planned = planUngroup(ctx);
    if (!planned.ok) return err(planned.rejection);
    return ctx.model
      ? outcomeOf(ctx.model.execute(planned.value))
      : err(NO_MODEL.rejection);
  },
};

const renameCommand: EditorCommand<RenameGroupArgs | undefined> = {
  id: GROUP_COMMAND_IDS.renameGroup,
  labelKey: `command.${GROUP_COMMAND_IDS.renameGroup}`,
  availability(args, ctx) {
    const group = soleGroup(ctx);
    if (!group.ok) return { available: false, rejection: group.rejection };
    const title = args?.title ?? ctx.reader?.getGroup(group.value)?.title ?? "";
    // Without a title the editor opens; a rename of the current title probes the gate.
    return availabilityOf(ctx, {
      ok: true,
      value: { kind: "renameGroup", group: group.value, title },
    });
  },
  run(args, ctx) {
    const group = soleGroup(ctx);
    if (!group.ok) return err(group.rejection);
    if (args?.title === undefined) {
      return ctx.editGroupTitle?.(group.value)
        ? ok({ changed: false })
        : err(rejectionOf("nothing-to-do", "The title editor did not open"));
    }
    return ctx.model
      ? outcomeOf(
          ctx.model.execute({
            kind: "renameGroup",
            group: group.value,
            title: args.title,
          }),
        )
      : err(NO_MODEL.rejection);
  },
};

export function registerGroupCommands(registry: CommandRegistry): void {
  registry.register(groupCommand);
  registry.register(ungroupCommand);
  registry.register(renameCommand);
}
