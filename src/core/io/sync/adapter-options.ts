/** Checks of the snapshot adapter options (misuse throws) and the default revision order. */
import { MisuseError } from "../../base/result.js";
import type { SnapshotAdapterOptions } from "./sync-types.js";

export function checkOptions(options: SnapshotAdapterOptions): void {
  if (typeof options !== "object" || options === null)
    throw new MisuseError("createSnapshotAdapter expects options");
  if (typeof options.idGenerator?.next !== "function")
    throw new MisuseError(
      "A host-owned document needs a globally unique ID generator: pass `idGenerator`",
    );
  if (typeof options.onSubmit !== "function")
    throw new MisuseError("createSnapshotAdapter needs an `onSubmit` callback");
  const ms = options.timeoutMs;
  if (
    ms !== undefined &&
    !(typeof ms === "number" && ms > 0 && Number.isFinite(ms))
  )
    throw new MisuseError(
      "`timeoutMs` must be a positive number of milliseconds",
    );
  if (
    options.compareRevisions !== undefined &&
    typeof options.compareRevisions !== "function"
  )
    throw new MisuseError("`compareRevisions` must be a function");
  if (
    options.history === "host" &&
    !(
      typeof options.onUndo === "function" &&
      typeof options.onRedo === "function" &&
      typeof options.historyState === "function"
    )
  )
    throw new MisuseError(
      "Host-owned history needs `onUndo`, `onRedo` and a `historyState` provider",
    );
  if (
    options.history !== undefined &&
    options.history !== "local" &&
    options.history !== "host"
  )
    throw new MisuseError('`history` must be "local" or "host"');
  if (
    options.nodeCreation !== undefined &&
    options.nodeCreation !== "local" &&
    options.nodeCreation !== "delegated"
  )
    throw new MisuseError('`nodeCreation` must be "local" or "delegated"');
  if (
    options.nodeCreation === "delegated" &&
    typeof options.onDelegate !== "function"
  )
    throw new MisuseError(
      "Delegated node creation needs an `onDelegate` callback",
    );
}

export function numericOrder(a: unknown, b: unknown): number {
  if (!(Number.isFinite(a) && Number.isFinite(b)))
    throw new MisuseError(
      "Snapshot revisions are compared as finite numbers; pass `compareRevisions` for other tokens",
    );
  return (a as number) - (b as number);
}
