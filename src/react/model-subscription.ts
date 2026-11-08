/** Subscribes one notifier to every model event that can change derived UI state. */
import type { ViewModel } from "../view/index.js";

export function onModelChange(
  model: ViewModel | undefined,
  notify: () => void,
): () => void {
  if (!model) return () => {};
  const offs = [
    model.on("change", notify),
    model.on("reset", notify),
    model.on("history", notify),
  ];
  return () => {
    for (const off of offs) off();
  };
}
