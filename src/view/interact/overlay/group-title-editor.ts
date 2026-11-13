/**
 * In-place editor of a group title: one text field in the overlay, over the title strip.
 * It has no border of its own: the title turns into editable text with a caret.
 *
 * Enter and leaving the field commit the text as one rename when it differs from the
 * current title; Escape closes without a change. The field is created on demand and
 * removed when it closes, so nothing exists in the DOM while no title is being edited.
 * Graph shortcuts and gestures never reach it: the input scoping leaves text fields and
 * overlay content to themselves. The editor closes without committing when its group is
 * removed or changed by any edit while it is open.
 */
import {
  type GeometryScene,
  type GraphReader,
  type GroupId,
  groupLockBox,
  MAX_GROUP_TITLE_LENGTH,
} from "../../../core/index.js";
import { resolveGroupStyle } from "../../render/theme/resolve-style.js";
import type { ThemeTokens } from "../../render/theme/tokens.js";
import type { OverlayAnchor, OverlayHandle } from "./overlay-host.js";

/** Left inset of the text, the same as the default painter's title. */
const TITLE_PAD = 8;

export interface GroupTitleEditorDeps {
  readonly document: Document;
  attach(element: HTMLElement, anchor: OverlayAnchor): OverlayHandle;
  readonly reader: GraphReader;
  readonly scene: Pick<GeometryScene, "group" | "groupMetrics">;
  readonly theme: () => ThemeTokens;
  /** Commit the new title; called only when it differs from the current one. */
  rename(group: GroupId, title: string): void;
  /** Give keyboard focus back to the editor's root after the field closes. */
  focusView(): void;
}

export interface GroupTitleEditor {
  /** Open on `group`; false when the group has no frame. Replaces an open editor. */
  open(group: GroupId): boolean;
  /** The group being edited, if any. */
  editing(): GroupId | undefined;
  /** Close without committing. */
  cancel(): void;
  /** Groups a committed change touched: an editor on one of them closes. */
  groupsChanged(ids: readonly string[]): void;
  dispose(): void;
}

export function createGroupTitleEditor(
  deps: GroupTitleEditorDeps,
): GroupTitleEditor {
  let open:
    | { group: GroupId; field: HTMLInputElement; handle: OverlayHandle }
    | undefined;

  // A press anywhere else ends the edit like leaving the field does. The canvas keeps
  // the focus where it is on a press, so `blur` alone would leave the field open over a
  // frame that the gesture is about to move. Capture phase: the title is committed
  // before the press starts a gesture.
  const pressOutside = (event: Event): void => {
    if (open && event.target !== open.field) close(true);
  };

  /** Remove the field; `commit` decides whether its text becomes the title. */
  function close(commit: boolean): void {
    const current = open;
    if (!current) return;
    // Cleared first: removing a focused field fires `blur`, which must not commit again.
    open = undefined;
    deps.document.removeEventListener("pointerdown", pressOutside, true);
    const hadFocus = deps.document.activeElement === current.field;
    const title = current.field.value;
    current.handle.dispose();
    if (hadFocus) deps.focusView();
    if (commit && title !== deps.reader.getGroup(current.group)?.title)
      deps.rename(current.group, title);
  }

  return {
    open(group) {
      close(true);
      const entry = deps.scene.group(group);
      if (!entry) return false;
      const theme = deps.theme();
      const style = resolveGroupStyle(theme, entry.record.style);
      const strip = entry.titleStrip;
      // World units: the anchor scales the field with the zoom, like the painted title.
      const lock = groupLockBox(entry.frame, deps.scene.groupMetrics, 1);
      const field = deps.document.createElement("input");
      field.type = "text";
      field.value = entry.record.title;
      field.maxLength = MAX_GROUP_TITLE_LENGTH;
      field.setAttribute("aria-label", "Group title");
      field.spellcheck = false;
      // No border and no ring: the field looks like the painted title it covers, on the
      // frame's own fill, and the caret and the selected text show that it has focus.
      field.style.cssText =
        `box-sizing:border-box;width:${Math.max(40, lock.x - strip.x - 4)}px;` +
        `height:${strip.h}px;margin:0;padding:0 ${TITLE_PAD}px;font:${theme.font};` +
        `color:${style.groupTitleColor};caret-color:${theme.selection};` +
        `background:linear-gradient(${style.groupFill},${style.groupFill}),` +
        `${theme.background};border:0;border-radius:0;outline:none;`;
      field.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          close(true);
        } else if (event.key === "Escape") {
          event.preventDefault();
          close(false);
        }
      });
      field.addEventListener("blur", () => close(true));
      const handle = deps.attach(field, {
        kind: "world",
        point: { x: strip.x, y: strip.y },
        scale: true,
      });
      open = { group, field, handle };
      deps.document.addEventListener("pointerdown", pressOutside, true);
      field.focus();
      field.select();
      return true;
    },
    editing: () => open?.group,
    cancel: () => close(false),
    groupsChanged(ids) {
      if (open && ids.includes(open.group)) close(false);
    },
    dispose: () => close(false),
  };
}
