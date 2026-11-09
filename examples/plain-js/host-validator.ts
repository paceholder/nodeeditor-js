// A stand-in for a host service that decides whether a connection is allowed. The library
// never asks by itself while it evaluates a drag: a tool asks once per target, the answer
// is cached, and the target is shown as pending until it arrives. This validator answers
// after a delay, and refuses connections into the vent valve to show a rejection reaching
// the host's own surface (the status line under the editor).
import {
  type ConnectionValidator,
  type GraphModel,
  rejectionOf,
} from "nodeeditor-js";

/** Milliseconds a real service might take; the demo wires gestures to this. */
export const VALIDATION_DELAY_MS = 700;

export function demoValidator(
  model: () => GraphModel | undefined,
  delayMs: () => number,
): ConnectionValidator {
  return ({ proposal, signal }) =>
    new Promise((resolve) => {
      const timer = setTimeout(() => {
        const target = model()?.reader.getNode(proposal.to.node);
        resolve(
          target?.title === "Vent valve"
            ? {
                valid: false,
                reason: rejectionOf(
                  "capability-denied",
                  "The plant refuses to feed the vent valve",
                  [proposal.to.port],
                ),
              }
            : { valid: true },
        );
      }, delayMs());
      // The library aborts the signal when nothing wants the answer any more.
      signal.addEventListener("abort", () => clearTimeout(timer), {
        once: true,
      });
    });
}
