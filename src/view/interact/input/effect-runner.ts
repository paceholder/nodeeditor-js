/**
 * Effect runner (D10): executes tool effects in order against a host. DOM-free; the DOM
 * adapter supplies pointer capture and cursor, everything else goes to view services.
 * A `commit` goes through the host's command path, the same one the API uses.
 */
import type { Command, Endpoint, Rejection } from "../../../core/index.js";
import type { SelectionModel } from "../selection/selection-model.js";
import type {
  ChoiceRelease,
  CursorKind,
  ToolEffect,
  ToolPreview,
  ViewportOp,
} from "../tools/tool-types.js";

export interface EffectHost {
  capture(pointerId: number): void;
  release(pointerId: number): void;
  cursor(cursor: CursorKind): void;
  preview(preview: ToolPreview | null): void;
  /** Plan and submit one command (fresh operation ID); failures are the host's to report. */
  commit(command: Command): void;
  readonly selection: Pick<SelectionModel, "apply">;
  viewport(op: ViewportOp): void;
  /** Hand a choice release to the choice controller; omitted: ignored. */
  choose?(request: ChoiceRelease): void;
  /** Start the host validator for a pair without a verdict; omitted: ignored. */
  requestVerdict?(source: Endpoint, target: Endpoint): void;
  /** A connection was refused during the gesture; omitted: ignored. */
  rejected?(rejection: Rejection): void;
}

export function createEffectRunner(
  host: EffectHost,
): (effects: readonly ToolEffect[]) => void {
  return (effects) => {
    for (const effect of effects) {
      switch (effect.type) {
        case "capture":
          host.capture(effect.pointerId);
          break;
        case "release":
          host.release(effect.pointerId);
          break;
        case "preview":
          host.preview(effect.preview);
          break;
        case "commit":
          host.commit(effect.command);
          break;
        case "select":
          host.selection.apply(effect.change);
          break;
        case "viewport":
          host.viewport(effect.op);
          break;
        case "cursor":
          host.cursor(effect.cursor);
          break;
        case "choose":
          host.choose?.(effect.request);
          break;
        case "request-verdict":
        case "validate-wait":
          // A wait asks too, in case the pair became pending only at the release.
          host.requestVerdict?.(effect.source, effect.target);
          break;
        case "reject":
          host.rejected?.(effect.rejection);
          break;
      }
    }
  };
}
