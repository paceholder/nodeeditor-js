/**
 * Input scoping: which DOM events belong to the editor. Keyboard listeners live
 * on the focusable root, never on `window`, so two editors on a page do not share
 * shortcuts; events from text fields, `contentEditable` hosts (overlay editors included)
 * and IME composition are left to the page.
 */

const TEXT_TAGS = new Set(["INPUT", "TEXTAREA", "SELECT"]);

interface ElementLike {
  readonly tagName?: string;
  readonly isContentEditable?: boolean;
  readonly parentNode?: unknown;
}

/** True for form fields and editable hosts, including text inside an overlay editor. */
export function isTextTarget(target: EventTarget | null): boolean {
  const el = target as ElementLike | null;
  if (!el || typeof el.tagName !== "string") return false;
  return TEXT_TAGS.has(el.tagName) || el.isContentEditable === true;
}

/** Keyboard events the editor may act on. */
export function shouldHandleKey(event: KeyboardEvent): boolean {
  // keyCode 229 is how browsers report keys consumed by an IME.
  if (event.isComposing || event.keyCode === 229) return false;
  return !isTextTarget(event.target);
}

/**
 * True when the event came from host DOM placed in the overlay (not the overlay layer
 * itself): that DOM handles its own pointer input and must not start a gesture.
 */
export function isOverlayContent(
  target: EventTarget | null,
  overlay: HTMLElement,
): boolean {
  const node = target as Node | null;
  return node !== null && node !== overlay && overlay.contains(node);
}
