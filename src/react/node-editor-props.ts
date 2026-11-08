/**
 * Which `NodeEditor` props can change on a live view and which need a new one.
 * Every mount option is classified in `OPTION_KIND`, typed as a total map, so adding an
 * option to the view without deciding how the component treats it fails to compile.
 *
 * - `live`: applied to the mounted view when the value changes.
 * - `remount`: has no runtime setter, so a change of identity mounts a fresh view; the
 *   docs ask hosts to memoize those values.
 * - `initial`: read once at mount and ignored afterwards, like a `defaultValue`, so an
 *   inline object never costs the view.
 * - `nested`: `input` is split further, see `remountKeys`.
 */
import type { CSSProperties, ReactNode } from "react";
import type { InputOptions, ViewHandle, ViewOptions } from "../view/index.js";

export type OptionKind = "live" | "remount" | "initial" | "nested";

export const OPTION_KIND: { readonly [K in keyof ViewOptions]-?: OptionKind } =
  {
    model: "remount",
    geometry: "remount",
    routes: "remount",
    routeEditors: "remount",
    zOrder: "remount",
    painters: "remount",
    assets: "remount",
    viewState: "remount",
    gestureBitmap: "remount",
    frameClock: "remount",
    initialViewport: "initial",
    initialFit: "initial",
    zoomLimits: "live",
    theme: "live",
    locked: "live",
    input: "nested",
  };

const OPTION_KEYS = Object.keys(OPTION_KIND) as ReadonlyArray<
  keyof ViewOptions
>;

export interface NodeEditorProps extends ViewOptions {
  readonly className?: string;
  readonly style?: CSSProperties;
  /**
   * Without a `locked` prop the view owns the flag and this is called on every change, by
   * the lock button of `ViewControls` or `view.setLocked`; the flag survives a remount.
   * With a `locked` prop the prop is the truth: a press of the lock button or a
   * `view.setLocked` call is reported here as an attempt and the view stays at the prop
   * until the host passes a new value. Keep the lock in state and update it from here.
   */
  readonly onLockedChange?: (locked: boolean) => void;
  /**
   * Called with the view each time one is mounted (again after a remount). For code that
   * needs the handle but sits outside a provider; elsewhere `useEditor()` is simpler.
   */
  readonly onReady?: (view: ViewHandle) => void;
  /**
   * Components that read this editor through the hooks, such as `ViewControls` and
   * `NodeOverlay`; they work without an `EditorProvider`. They render next to the
   * container, not inside it, so give them no layout of their own unless they position
   * themselves (the controls and overlays render into the view's overlay layer).
   */
  readonly children?: ReactNode;
}

/** Values whose identity decides a remount, in a fixed order. */
export function remountKeys(p: NodeEditorProps): readonly unknown[] {
  const keys: unknown[] = [];
  for (const k of OPTION_KEYS)
    if (OPTION_KIND[k] === "remount") keys.push(p[k]);
  const input = p.input;
  const live: InputOptions | undefined = input === false ? undefined : input;
  keys.push(
    input === false,
    live?.tools,
    live?.keymap,
    live?.platform,
    live?.clipboard,
  );
  return keys;
}

export function sameKeys(
  a: readonly unknown[],
  b: readonly unknown[],
): boolean {
  return a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
}

/** The mount options: the view's options out of the props, without undefined values. */
export function viewOptionsOf(p: NodeEditorProps): ViewOptions {
  const out: Record<string, unknown> = {};
  for (const k of OPTION_KEYS) if (p[k] !== undefined) out[k] = p[k];
  return out as ViewOptions;
}
