/** Shared helpers for view tests: a recording canvas context and a ready-made frame. */
import { DEFAULT_VIEWPORT, type Viewport } from "../core/index.js";
import {
  createPaintFrame,
  type PaintFrame,
} from "./render/primitives/frame.js";
import { DEFAULT_THEME, type ThemeTokens } from "./render/theme/tokens.js";

export interface FakeContext {
  readonly ctx: CanvasRenderingContext2D;
  /** Method names called, in order; property writes appear as `name=value`. */
  readonly calls: string[];
}

/** A context that records calls and accepts any property; it draws nothing. */
export function fakeContext(): FakeContext {
  const calls: string[] = [];
  const target: Record<string, unknown> = {};
  const ctx = new Proxy(target, {
    get(t, name: string) {
      if (name in t) return t[name];
      return (..._args: unknown[]) => {
        calls.push(name);
      };
    },
    set(t, name: string, value: unknown) {
      t[name] = value;
      calls.push(`${name}=${String(value)}`);
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
  return { ctx, calls };
}

export function testFrame(
  viewport: Viewport = DEFAULT_VIEWPORT,
  theme: ThemeTokens = DEFAULT_THEME,
  size = { width: 800, height: 600, dpr: 1 },
): PaintFrame {
  return createPaintFrame(size, viewport, theme);
}
