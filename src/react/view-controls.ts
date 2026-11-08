/**
 * Optional controls panel: zoom in, zoom out, fit to content and a lock toggle.
 * Plain buttons with stable class names and no bundled stylesheet, placed in a corner of
 * the view (bottom-left by default). Hosts restyle it, move it, drop single buttons or
 * render their own controls with the hooks instead.
 */
import { type CSSProperties, createElement, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useEditor } from "./editor-context.js";
import { useCommandAvailability } from "./use-command-availability.js";
import { useViewLocked } from "./use-view-locked.js";

export type ControlsCorner =
  | "bottom-left"
  | "bottom-right"
  | "top-left"
  | "top-right";

export type ControlsButton = "zoomIn" | "zoomOut" | "fit" | "lock";

const DEFAULT_LABELS: Readonly<Record<ControlsButton, string>> = {
  zoomIn: "Zoom in",
  zoomOut: "Zoom out",
  fit: "Fit to content",
  lock: "Lock editing",
};

const SYMBOLS: Readonly<Record<ControlsButton, string>> = {
  zoomIn: "+",
  zoomOut: "−",
  fit: "⤢",
  lock: "🔒",
};

const FIT_COMMAND = "view.fitAll";

export interface ViewControlsProps {
  /** Corner of the view. Default `"bottom-left"`. */
  readonly corner?: ControlsCorner;
  /** Set a button to `false` to leave it out. All four show by default. */
  readonly buttons?: Partial<Readonly<Record<ControlsButton, boolean>>>;
  /** Zoom factor of one press of the zoom buttons. Default 1.25. */
  readonly zoomFactor?: number;
  /** Accessible names and tooltips, for localization. */
  readonly labels?: Partial<Readonly<Record<ControlsButton, string>>>;
  readonly className?: string;
  readonly style?: CSSProperties;
}

const CORNER_STYLE: Readonly<Record<ControlsCorner, CSSProperties>> = {
  "bottom-left": { left: 8, bottom: 8 },
  "bottom-right": { right: 8, bottom: 8 },
  "top-left": { left: 8, top: 8 },
  "top-right": { right: 8, top: 8 },
};

export function ViewControls(props: ViewControlsProps): ReactNode {
  const view = useEditor();
  const locked = useViewLocked();
  const fit = useCommandAvailability(FIT_COMMAND);
  if (!view) return null;
  const factor = props.zoomFactor ?? 1.25;
  const label = (b: ControlsButton): string =>
    props.labels?.[b] ?? DEFAULT_LABELS[b];
  const zoomBy = (by: number): void => {
    const { width, height } = view.metrics();
    view.viewport.zoomAt({ x: width / 2, y: height / 2 }, by);
  };
  const button = (
    which: ControlsButton,
    name: string,
    onClick: () => void,
    extra: Record<string, unknown> = {},
  ): ReactNode =>
    props.buttons?.[which] === false
      ? null
      : createElement(
          "button",
          {
            key: which,
            type: "button",
            className: `nodeeditor-controls__button nodeeditor-controls__${name}`,
            "aria-label": label(which),
            title: label(which),
            onClick,
            ...extra,
          },
          SYMBOLS[which],
        );
  const panel = createElement(
    "div",
    {
      className: ["nodeeditor-controls", props.className]
        .filter(Boolean)
        .join(" "),
      style: {
        position: "absolute",
        display: "flex",
        flexDirection: "column",
        gap: 4,
        pointerEvents: "auto",
        ...CORNER_STYLE[props.corner ?? "bottom-left"],
        ...props.style,
      },
    },
    button("zoomIn", "zoom-in", () => zoomBy(factor)),
    button("zoomOut", "zoom-out", () => zoomBy(1 / factor)),
    button("fit", "fit", () => void view.commands.run(FIT_COMMAND), {
      disabled: !fit.available,
      ...(fit.available ? {} : { title: fit.reason.message }),
    }),
    button("lock", "lock", () => view.setLocked(!locked), {
      "aria-pressed": locked,
    }),
  );
  // In the overlay layer, so a press or a wheel turn on the panel is not the canvas's.
  return createPortal(panel, view.overlayElement);
}
