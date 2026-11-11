/**
 * What an external authority has not confirmed yet, read from the bound model for the
 * painters: which entities an edit awaiting the host touches, and the placeholders of
 * delegated creations. A model offers them when it has `unconfirmed()` and
 * `placeholders()` (the snapshot model does); any other model has neither.
 *
 * Painters ask once per entity, so one paint reads the model once: the answer is kept
 * until the running code yields (it is dropped in a microtask). A paint is synchronous and
 * painters cannot change the model, so every entity of one paint sees the same answer.
 */
import type { CreationPlaceholder, UnconfirmedIds } from "../../core/index.js";

/** The parts of a model that report unconfirmed state. */
export interface PendingSource {
  unconfirmed(): UnconfirmedIds;
  placeholders(): readonly CreationPlaceholder[];
}

export interface PendingState {
  isUnconfirmed(id: string): boolean;
  placeholders(): readonly CreationPlaceholder[];
}

function isPendingSource(model: unknown): model is PendingSource {
  const m = model as Partial<PendingSource> | undefined;
  return (
    typeof m?.unconfirmed === "function" &&
    typeof m?.placeholders === "function"
  );
}

/** Undefined when the model reports no unconfirmed state (a local model). */
export function pendingStateOf(model: unknown): PendingState | undefined {
  if (!isPendingSource(model)) return undefined;
  let ids: ReadonlySet<string> | undefined;
  const read = (): ReadonlySet<string> => {
    if (ids) return ids;
    const { nodes, ports, connections } = model.unconfirmed();
    const all = new Set<string>([...nodes, ...ports, ...connections]);
    ids = all;
    queueMicrotask(() => {
      ids = undefined;
    });
    return all;
  };
  return {
    isUnconfirmed: (id) => read().has(id),
    placeholders: () => model.placeholders(),
  };
}

/**
 * The model's pending state merged with the host's view state for the painters. A part
 * neither offers stays unset (a plain local model leaves both unset); a part only one
 * offers is read from it directly, so a paint allocates no list for it.
 */
export function mergePendingState(
  own: PendingState | undefined,
  host: Partial<PendingState>,
): Partial<PendingState> {
  const hostFlag = host.isUnconfirmed?.bind(host);
  const hostList = host.placeholders?.bind(host);
  const isUnconfirmed =
    own && hostFlag
      ? (id: string) => own.isUnconfirmed(id) || hostFlag(id) === true
      : (own?.isUnconfirmed ??
        (hostFlag && ((id: string) => hostFlag(id) === true)));
  const placeholders =
    own && hostList
      ? (): readonly CreationPlaceholder[] => {
          const mine = own.placeholders();
          const theirs = hostList();
          if (theirs.length === 0) return mine;
          return mine.length === 0 ? theirs : [...mine, ...theirs];
        }
      : (own?.placeholders ?? hostList);
  return {
    ...(isUnconfirmed ? { isUnconfirmed } : {}),
    ...(placeholders ? { placeholders } : {}),
  };
}
