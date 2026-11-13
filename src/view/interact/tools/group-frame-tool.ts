/**
 * Group frame tool: the lock icon and title editing.
 *
 * A click on a frame's lock icon commits one `setGroupLocked`. A second press on the
 * same title strip within `doubleClickMs` is a double-click and asks the view to edit
 * the title. Everything else on a frame, including a drag that starts on the title
 * strip, is left to the select-and-move tool, which comes after this one.
 *
 * The tool remembers the last title press to recognize a double-click, so it is created
 * per view (`createGroupFrameTool`); the transition is otherwise a pure function of its
 * state.
 */
import type { GroupId, HitCandidate, Point } from "../../../core/index.js";
import { distancePx, dragThreshold } from "./thresholds.js";
import type {
  PointerType,
  PressInfo,
  Tool,
  ToolContext,
  ToolEffect,
} from "./tool-types.js";

export type GroupFrameState =
  | { readonly kind: "idle" }
  | {
      readonly kind: "pressed";
      readonly pointerId: number;
      readonly pointerType: PointerType | undefined;
      readonly startViewport: Point<"viewport">;
      readonly group: GroupId;
      /** What a release without a drag does. */
      readonly action: "toggle-lock" | "edit-title";
    };

const IDLE: GroupFrameState = { kind: "idle" };

type GroupHit = Extract<HitCandidate, { kind: "group" }>;

/** The frame part under a press, only when the frame is the topmost hit. */
function frameHit(
  hits: readonly HitCandidate[],
  ctx: ToolContext,
): GroupHit | undefined {
  const top = hits[0];
  return top?.kind === "group" && ctx.options.groups !== false
    ? top
    : undefined;
}

export function createGroupFrameTool(): Tool<GroupFrameState> {
  let lastTitle:
    | { group: GroupId; time: number; viewport: Point<"viewport"> }
    | undefined;

  /** The action of a press, remembering a first title press for the next one. */
  function actionOf(
    { input, hits }: Pick<PressInfo, "input" | "hits">,
    ctx: ToolContext,
    remember: boolean,
  ): { group: GroupId; action: "toggle-lock" | "edit-title" } | undefined {
    const hit = frameHit(hits, ctx);
    if (!hit) return undefined;
    if (hit.part === "lock")
      return { group: hit.groupId, action: "toggle-lock" };
    if (hit.part !== "title") return undefined;
    const last = lastTitle;
    const double =
      last !== undefined &&
      last.group === hit.groupId &&
      input.time - last.time <= ctx.options.doubleClickMs &&
      distancePx(input.viewport, last.viewport) <=
        dragThreshold(ctx.options, input.pointerType);
    if (double) return { group: hit.groupId, action: "edit-title" };
    if (remember)
      lastTitle = {
        group: hit.groupId,
        time: input.time,
        viewport: input.viewport,
      };
    return undefined;
  }

  return {
    id: "group-frame",
    idle: IDLE,
    accepts: (press, ctx) =>
      press.input.button === 0 &&
      !press.spaceHeld &&
      actionOf(press, ctx, true) !== undefined,
    isIdle: (state) => state.kind === "idle",
    involved: (state) => (state.kind === "idle" ? [] : [state.group]),
    transition(state, input, ctx) {
      if (state.kind === "idle") {
        if (input.type !== "pointer-down") return { state, effects: [] };
        const found = actionOf(
          { input, hits: ctx.pick(input.world) },
          ctx,
          false,
        );
        if (!found) return { state, effects: [] };
        if (found.action === "edit-title") lastTitle = undefined;
        return {
          state: {
            kind: "pressed",
            pointerId: input.pointerId,
            pointerType: input.pointerType,
            startViewport: input.viewport,
            ...found,
          },
          effects: [],
        };
      }
      if (input.type === "cancel") return { state: IDLE, effects: [] };
      if (input.type !== "pointer-up" || input.pointerId !== state.pointerId)
        return { state, effects: [] };
      // A press that wandered off is not a click.
      const still =
        distancePx(input.viewport, state.startViewport) <=
        dragThreshold(ctx.options, state.pointerType);
      const group = ctx.reader.getGroup(state.group);
      if (!still || !group) return { state: IDLE, effects: [] };
      const effect: ToolEffect =
        state.action === "toggle-lock"
          ? {
              type: "commit",
              command: {
                kind: "setGroupLocked",
                group: group.id,
                locked: !group.locked,
              },
            }
          : { type: "edit-group-title", group: group.id };
      return { state: IDLE, effects: [effect] };
    },
  };
}
