/**
 * Which `NodeEditor` props can change on a live view and which need a new one.
 * Settable: `theme`, `input.toolOptions` and `input.chooseConnection`. Everything else
 * has no runtime setter on the view, so a change of identity mounts a fresh view; the
 * docs ask hosts to memoize those values.
 */
import type { CSSProperties } from "react";
import type { InputOptions, ViewOptions } from "../view/index.js";

export interface NodeEditorProps extends ViewOptions {
  readonly className?: string;
  readonly style?: CSSProperties;
}

/** Values whose identity decides a remount, in a fixed order. */
export function remountKeys(p: NodeEditorProps): readonly unknown[] {
  const input = p.input;
  const live: InputOptions | undefined = input === false ? undefined : input;
  return [
    p.model,
    p.geometry,
    p.routes,
    p.routeEditors,
    p.zOrder,
    p.painters,
    p.assets,
    p.viewState,
    p.initialViewport,
    p.zoomLimits,
    p.initialFit,
    p.gestureBitmap,
    p.frameClock,
    input === false,
    live?.tools,
    live?.keymap,
    live?.platform,
    live?.clipboard,
  ];
}

export function sameKeys(
  a: readonly unknown[],
  b: readonly unknown[],
): boolean {
  return a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
}

/** The mount options: the props without the container attributes and undefined values. */
export function viewOptionsOf(p: NodeEditorProps): ViewOptions {
  const { className: _c, style: _s, ...rest } = p;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(rest)) if (v !== undefined) out[k] = v;
  return out as ViewOptions;
}
