/**
 * Container size and device-pixel-ratio tracking (GEO-03, GEO-06).
 *
 * Size comes from a ResizeObserver (content box). The ratio is watched with a
 * `matchMedia("(resolution: Xdppx)")` listener that re-registers after every change.
 * The client rect is read at call time, never cached, so page scroll and nested offsets
 * are always current.
 */
import { MAX_DPR, MIN_DPR } from "../../../core/index.js";

export interface ContainerMetrics {
  /** CSS pixels. Zero in either dimension means "not measurable yet". */
  size(): { readonly width: number; readonly height: number };
  dpr(): number;
  /** Fresh client rect of the observed element. */
  clientRect(): { readonly left: number; readonly top: number };
  isMeasurable(): boolean;
  dispose(): void;
}

function sanitizeDpr(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 1;
  return Math.min(MAX_DPR, Math.max(MIN_DPR, value));
}

export function observeContainer(
  element: HTMLElement,
  onChange: () => void,
): ContainerMetrics {
  const win = element.ownerDocument.defaultView;
  if (!win) throw new Error("Container is not attached to a window");
  let disposed = false;
  let width = element.clientWidth;
  let height = element.clientHeight;
  let dpr = sanitizeDpr(win.devicePixelRatio);

  const observer = new win.ResizeObserver((entries) => {
    const entry = entries[entries.length - 1];
    if (disposed || !entry) return;
    width = entry.contentRect.width;
    height = entry.contentRect.height;
    // A ratio change also reaches here via the device-pixel box (below).
    const next = sanitizeDpr(win.devicePixelRatio);
    if (next !== dpr) {
      dpr = next;
      watchDpr();
    }
    onChange();
  });
  observer.observe(element);
  try {
    // Fires on pixel-ratio changes even when the CSS size is unchanged (Chromium).
    observer.observe(element, { box: "device-pixel-content-box" });
  } catch {
    // Unsupported box: the media-query watch below still covers ratio changes.
  }

  let query: MediaQueryList | undefined;
  const onDprChange = (): void => {
    if (disposed) return;
    dpr = sanitizeDpr(win.devicePixelRatio);
    watchDpr();
    onChange();
  };
  function watchDpr(): void {
    query?.removeEventListener("change", onDprChange);
    query = win?.matchMedia(`(resolution: ${win.devicePixelRatio}dppx)`);
    query?.addEventListener("change", onDprChange);
  }
  watchDpr();
  // Browser zoom and display moves also fire window resize; re-check the ratio there.
  const onWindowResize = (): void => {
    if (disposed || sanitizeDpr(win.devicePixelRatio) === dpr) return;
    onDprChange();
  };
  win.addEventListener("resize", onWindowResize);

  return {
    size: () => ({ width, height }),
    dpr: () => dpr,
    clientRect() {
      const r = element.getBoundingClientRect();
      return { left: r.left, top: r.top };
    },
    isMeasurable: () => width > 0 && height > 0,
    dispose() {
      disposed = true;
      observer.disconnect();
      win.removeEventListener("resize", onWindowResize);
      query?.removeEventListener("change", onDprChange);
      query = undefined;
    },
  };
}
