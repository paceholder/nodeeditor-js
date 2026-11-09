// Example host context menu. The library ships no menu: it raises "context-menu" with the
// target, the selection and positions, and this code builds a plain DOM list in the
// view's overlay. Every item is a registered command run through view.commands, so it
// matches the shortcut, explains why it is unavailable, and undoes the same way.
import type {
  ContextMenuEvent,
  ViewHandle,
} from "@paceholder/nodeeditor-js/view";

// Host-side labels for the command label keys the menu offers, in menu order. Commands
// the host has no label for (nudge, reveal) are left out.
const LABELS: ReadonlyArray<readonly [string, string, unknown?]> = [
  ["command.edit.cut", "Cut"],
  ["command.edit.copy", "Copy"],
  ["command.edit.paste", "Paste here"],
  ["command.edit.duplicate", "Duplicate"],
  ["command.edit.delete", "Delete"],
  ["command.nodes.rotate", "Rotate clockwise", { turns: 1 }],
  ["command.nodes.mirror", "Mirror left-right", { axis: "horizontal" }],
  ["command.route.reset", "Reset route"],
  ["command.selection.selectAll", "Select all"],
  ["command.view.fitAll", "Fit all"],
  ["command.history.undo", "Undo"],
  ["command.history.redo", "Redo"],
];
// On empty canvas only these make sense; the rest act on the selection.
const CANVAS_ONLY = new Set([
  "command.edit.paste",
  "command.selection.selectAll",
  "command.view.fitAll",
  "command.history.undo",
  "command.history.redo",
]);

export function installContextMenu(view: ViewHandle): () => void {
  const menu = document.createElement("div");
  menu.className = "context-menu";
  menu.setAttribute("role", "menu");
  let handle: ReturnType<ViewHandle["overlay"]["attach"]> | undefined;

  const close = (refocus: boolean) => {
    handle?.dispose();
    handle = undefined;
    menu.replaceChildren();
    document.removeEventListener("pointerdown", onAway, true);
    if (refocus) view.element.focus();
  };
  // Click-away: any press outside the menu closes it (and still does its own thing).
  const onAway = (e: PointerEvent) => {
    if (!menu.contains(e.target as Node)) close(false);
  };
  menu.addEventListener("keydown", (e) => {
    const items = [...menu.querySelectorAll("button:not(:disabled)")];
    const at = items.indexOf(document.activeElement as Element);
    if (e.key === "Escape") close(true);
    else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      const step = e.key === "ArrowDown" ? 1 : -1;
      (
        items[(at + step + items.length) % items.length] as HTMLElement
      )?.focus();
    } else return;
    e.preventDefault();
  });

  const open = (event: ContextMenuEvent) => {
    close(false);
    const available = new Map(
      view.commands.list().map((c) => [c.labelKey, c.id]),
    );
    for (const [labelKey, label, extra] of LABELS) {
      const id = available.get(labelKey);
      if (!id) continue;
      if (event.target.kind === "canvas" && !CANVAS_ONLY.has(labelKey))
        continue;
      // "Paste here" pastes at the clicked point, which also works for touch.
      const args =
        labelKey === "command.edit.paste" ? { at: event.world } : extra;
      const state = view.commands.availability(id, args);
      const item = document.createElement("button");
      item.type = "button";
      item.setAttribute("role", "menuitem");
      item.textContent = label;
      item.disabled = !state.available;
      if (!state.available) item.title = state.rejection.message;
      item.addEventListener("click", () => {
        view.commands.run(id, args);
        close(true);
      });
      menu.append(item);
    }
    // Screen-fixed at the event's viewport point: it stays put while the view moves.
    handle = view.overlay.attach(menu, {
      kind: "viewport",
      point: event.viewport,
    });
    document.addEventListener("pointerdown", onAway, true);
    menu.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
  };

  const off = view.on("context-menu", open);
  return () => {
    off();
    close(false);
  };
}
