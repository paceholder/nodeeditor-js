/**
 * Which `NodeEditor` props can change on a live view and which need a new one.
 * Every mount option is classified in `OPTION_KIND`, typed as a total map, so adding an
 * option to the view without deciding how the component treats it fails to compile.
 *
 * - `live`: applied to the mounted view when the value changes.
 * - `remount`: has no runtime setter, so a change of identity mounts a fresh view; the
 *   docs ask hosts to memoize those values.
 * - `initial`: read once at mount and ignored afterwards.
 * - `nested`: `input` is split further, see `remountKeys`.
 */
import type { CSSProperties } from "react";
import type { InputOptions, ViewOptions } from "../view/index.js";

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
    initialViewport: "remount",
    zoomLimits: "remount",
    initialFit: "remount",
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
   * Called when the view's lock changes, whoever changed it: the `locked` prop, the lock
   * button of `ViewControls`, or `view.setLocked`. Keep the lock in state and pass it
   * back through `locked` to make it fully controlled.
   */
  readonly onLockedChange?: (locked: boolean) => void;
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
