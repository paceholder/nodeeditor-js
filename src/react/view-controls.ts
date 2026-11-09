/**
 * Optional controls panel: zoom in, zoom out, fit to content and a lock toggle.
 * Plain buttons with stable class names, inline SVG icons and no bundled stylesheet, placed
 * in a corner of the view (bottom-left by default). Hosts restyle it, move it, drop single
 * buttons, replace the icons, add buttons of their own as children, or render their own
 * controls with the hooks instead. The zoom and fit buttons run the view's commands, so
 * they follow availability: zoom in is disabled at the maximum zoom, for example.
 */
import {
  type CSSProperties,
  createElement,
  type ReactNode,
  useMemo,
} from "react";
import { createPortal } from "react-dom";
import { COMMAND_IDS } from "../view/index.js";
import { useEditor } from "./editor-context.js";
import { useCommand } from "./use-command.js";
import { useViewLocked } from "./use-view-locked.js";

export type ControlsCorner =
  | "bottom-left"
  | "bottom-right"
  | "top-left"
  | "top-right";

/** The four built-in buttons. */
export type ControlsButtonName = "zoomIn" | "zoomOut" | "fit" | "lock";

/** Icons a host can replace. The lock button shows `locked` or `unlocked` by state. */
export type ControlsIcon = "zoomIn" | "zoomOut" | "fit" | "locked" | "unlocked";

const DEFAULT_LABELS: Readonly<Record<ControlsButtonName, string>> = {
  zoomIn: "Zoom in",
  zoomOut: "Zoom out",
  fit: "Fit to content",
  lock: "Lock editing",
};

const ICON_PATHS: Readonly<Record<ControlsIcon, readonly string[]>> = {
  zoomIn: ["M8 3v10M3 8h10"],
  zoomOut: ["M3 8h10"],
  fit: ["M3 6V3h3M10 3h3v3M13 10v3h-3M6 13H3v-3"],
  locked: ["M4 7.5h8v6H4z", "M5.5 7.5V5.5a2.5 2.5 0 0 1 5 0v2"],
  unlocked: ["M4 7.5h8v6H4z", "M5.5 7.5V5.5a2.5 2.5 0 0 1 4.9-.7"],
};

function icon(which: ControlsIcon): ReactNode {
  return createElement(
    "svg",
    {
      width: 16,
      height: 16,
      viewBox: "0 0 16 16",
      fill: "none",
      stroke: "currentColor",
      strokeWidth: 1.5,
      strokeLinecap: "round",
      strokeLinejoin: "round",
      "aria-hidden": true,
      focusable: false,
    },
    ...ICON_PATHS[which].map((d) => createElement("path", { key: d, d })),
  );
}

export interface ViewControlsProps {
  /** Corner of the view. Default `"bottom-left"`. */
  readonly corner?: ControlsCorner;
  /** Set a button to `false` to leave it out. All four show by default. */
  readonly buttons?: Partial<Readonly<Record<ControlsButtonName, boolean>>>;
  /** Zoom factor of one press of the zoom buttons. Default 1.25. */
  readonly zoomFactor?: number;
  /** Accessible names and tooltips, for localization. */
  readonly labels?: Partial<Readonly<Record<ControlsButtonName, string>>>;
  /** Replacement icons (any element, such as your icon set's), by button and state. */
  readonly icons?: Partial<Readonly<Record<ControlsIcon, ReactNode>>>;
  readonly className?: string;
  readonly style?: CSSProperties;
  /** Buttons of your own, after the built-in ones: use `ControlsButton`. */
  readonly children?: ReactNode;
}

export interface ControlsButtonProps {
  /** Accessible name; also the tooltip unless `title` is given. */
  readonly label: string;
  readonly onClick: () => void;
  readonly disabled?: boolean;
  /** Tooltip. Defaults to `label`; a disabled button might explain why. */
  readonly title?: string;
  /** Set for a toggle: the button then reports `aria-pressed`. */
  readonly pressed?: boolean;
  readonly className?: string;
  readonly children?: ReactNode;
}

/** One button of the panel. Use it as a child of `ViewControls` to add your own. */
export function ControlsButton(props: ControlsButtonProps): ReactNode {
  return createElement(
    "button",
    {
      type: "button",
      className: ["nodeeditor-controls__button", props.className]
        .filter(Boolean)
        .join(" "),
      "aria-label": props.label,
      title: props.title ?? props.label,
      disabled: props.disabled === true,
      ...(props.pressed === undefined ? {} : { "aria-pressed": props.pressed }),
      onClick: props.onClick,
    },
    props.children,
  );
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
  const factor = props.zoomFactor ?? 1.25;
  const zoomIn = useCommand(
    COMMAND_IDS.zoomIn,
    useMemo(() => ({ factor }), [factor]),
  );
  const zoomOut = useCommand(
    COMMAND_IDS.zoomOut,
    useMemo(() => ({ factor }), [factor]),
  );
  const fit = useCommand(COMMAND_IDS.fitAll);
  if (!view) return null;
  const label = (b: ControlsButtonName): string =>
    props.labels?.[b] ?? DEFAULT_LABELS[b];
  const shown = (b: ControlsButtonName): boolean =>
    props.buttons?.[b] !== false;
  const glyph = (which: ControlsIcon): ReactNode =>
    props.icons?.[which] ?? icon(which);
  const commandButton = (
    which: Exclude<ControlsButtonName, "lock">,
    name: string,
    state: {
      available: boolean;
      rejection?: { message: string } | undefined;
      run(): unknown;
    },
  ): ReactNode =>
    shown(which)
      ? createElement(
          ControlsButton,
          {
            key: which,
            label: label(which),
            className: `nodeeditor-controls__${name}`,
            disabled: !state.available,
            ...(state.rejection ? { title: state.rejection.message } : {}),
            onClick: () => void state.run(),
          },
          glyph(which),
        )
      : null;
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
    commandButton("zoomIn", "zoom-in", zoomIn),
    commandButton("zoomOut", "zoom-out", zoomOut),
    commandButton("fit", "fit", fit),
    shown("lock")
      ? createElement(
          ControlsButton,
          {
            key: "lock",
            label: label("lock"),
            className: "nodeeditor-controls__lock",
            pressed: locked,
            onClick: () => view.setLocked(!locked),
          },
          glyph(locked ? "locked" : "unlocked"),
        )
      : null,
    props.children,
  );
  // In the overlay layer, so a press or a wheel turn on the panel is not the canvas's.
  return createPortal(panel, view.overlayElement);
}
