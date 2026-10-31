/**
 * Mount-time clipboard wiring (EDT-05, REA-06, D9): the `navigator.clipboard` adapter,
 * read only when a view mounts, and the handle surface a view exposes.
 */
import {
  err,
  type PayloadCodecRegistry,
  type Rejection,
  rejectionOf,
  type SnapshotLimits,
} from "../../../core/index.js";
import type { ClipboardService, SystemClipboard } from "./clipboard-types.js";

/** What `ViewHandle.clipboard` offers a host: export/import dialogs and a toolbar paste. */
export type ViewClipboard = Pick<
  ClipboardService,
  "exportText" | "importText" | "pasteFromSystem" | "on"
>;

/** The async Clipboard API of the root's window, if the browser has one. */
export function systemClipboardOf(
  root: HTMLElement,
): SystemClipboard | undefined {
  const clipboard = root.ownerDocument.defaultView?.navigator.clipboard;
  if (
    !clipboard ||
    typeof clipboard.writeText !== "function" ||
    typeof clipboard.readText !== "function"
  ) {
    return undefined;
  }
  return {
    writeText: (text) => clipboard.writeText(text),
    readText: () => clipboard.readText(),
  };
}

/** Codecs and limits a `GraphModel` carries; other models may have none. */
export function fragmentOptionsOf(model: object | undefined): {
  codecs?: PayloadCodecRegistry;
  limits?: Partial<SnapshotLimits>;
} {
  const m = model as
    | {
        payloadCodecs?: PayloadCodecRegistry;
        fragmentLimits?: Partial<SnapshotLimits>;
      }
    | undefined;
  return {
    ...(m?.payloadCodecs ? { codecs: m.payloadCodecs } : {}),
    ...(m?.fragmentLimits ? { limits: m.fragmentLimits } : {}),
  };
}

const NO_MODEL: Rejection = rejectionOf(
  "unknown-entity",
  "The view has no model",
);

/** The clipboard of a view without a model: every call reports that. */
export const UNBOUND_CLIPBOARD: ViewClipboard = {
  exportText: () => err(NO_MODEL),
  importText: () => err(NO_MODEL),
  pasteFromSystem: async () => err(NO_MODEL),
  on: () => () => {},
};
