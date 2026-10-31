/**
 * Native clipboard event bridge (D8).
 *
 * Keyboard copy, cut and paste use the browser's `copy` / `cut` / `paste` events: they
 * read and write `text/plain` synchronously and need no permission prompt in any
 * supported browser. The key-down of those chords keeps its default, the browser fires
 * the event, and this bridge runs the editor command with the event's data.
 *
 * Browsers target a clipboard event at the focused element only when it is editable, and
 * otherwise at the selection or the body. So the listeners sit on the document and act
 * only while focus is inside this editor's root, never in a text field (an overlay
 * editor keeps its own clipboard). Two editors on one page therefore never share an
 * event.
 *
 * There is no timed fallback: a native chord does nothing by itself, and the event alone
 * runs the command, so one shortcut is always one command. Browsers read the system
 * clipboard asynchronously before a paste event, so guessing that "no event came" after
 * some delay would race the real event. Hosts without the events use `view.clipboard`.
 */
import { isTextTarget } from "../input/input-scope.js";

/** The kind of clipboard event and the command it runs. */
export type ClipboardCommandId = "edit.copy" | "edit.cut" | "edit.paste";

export interface ClipboardEventsDeps {
  /** Run an editor command; returns whether it succeeded. */
  readonly run: (id: string, args: unknown) => { readonly ok: boolean };
  /** The command IDs per event type (defaults: edit.copy, edit.cut, edit.paste). */
  readonly commands?: Partial<Record<"copy" | "cut" | "paste", string>>;
}

export interface ClipboardEvents {
  dispose(): void;
}

export function attachClipboardEvents(
  root: HTMLElement,
  deps: ClipboardEventsDeps,
): ClipboardEvents {
  const doc = root.ownerDocument;
  const ids = {
    copy: deps.commands?.copy ?? "edit.copy",
    cut: deps.commands?.cut ?? "edit.cut",
    paste: deps.commands?.paste ?? "edit.paste",
  };
  /** True when this editor owns the event: focus inside the root, not in a text field. */
  const owns = (e: Event): boolean => {
    const active = doc.activeElement;
    if (!active || !root.contains(active)) return false;
    return !isTextTarget(active) && !isTextTarget(e.target);
  };

  const onCopyOrCut = (e: ClipboardEvent): void => {
    if (!owns(e)) return;
    const data = e.clipboardData;
    const id = e.type === "cut" ? ids.cut : ids.copy;
    const sink = data
      ? (text: string) => data.setData("text/plain", text)
      : undefined;
    // Without event data the command still fills the in-app buffer.
    const outcome = deps.run(id, sink ? { sink } : undefined);
    if (outcome.ok && sink) e.preventDefault();
  };

  const onPaste = (e: ClipboardEvent): void => {
    if (!owns(e)) return;
    const data = e.clipboardData;
    // Text without the fragment marker is reported as not-a-fragment by the command; the
    // in-app buffer is not used, because the user evidently copied something else.
    deps.run(
      ids.paste,
      data ? { text: data.getData("text/plain") } : undefined,
    );
    e.preventDefault();
  };

  const listeners: Array<[string, EventListener]> = [
    ["copy", onCopyOrCut as EventListener],
    ["cut", onCopyOrCut as EventListener],
    ["paste", onPaste as EventListener],
  ];
  for (const [type, fn] of listeners) doc.addEventListener(type, fn);

  let disposed = false;
  return {
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const [type, fn] of listeners) doc.removeEventListener(type, fn);
    },
  };
}
