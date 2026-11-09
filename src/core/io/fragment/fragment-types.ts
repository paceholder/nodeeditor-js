/**
 * The clipboard fragment envelope.
 *
 * A fragment is a graph snapshot without an ID cursor, wrapped in a small
 * versioned envelope with its own format marker. The marker is what lets a paste tell
 * library text from ordinary clipboard text. The envelope also lists the connections
 * that reached outside the copied nodes; they are never part of `fragment.connections`,
 * so the fragment stays valid under the snapshot validator.
 *
 * Payloads inside a fragment are always in their JSON form (encoded by the type's codec
 * when one is registered); paste decodes them when it builds records.
 */
import type { ExcludedReference } from "../../edit/commands/types.js";
import type {
  ConnectionSnapshot,
  GraphSnapshot,
} from "../snapshot/snapshot-types.js";

export const FRAGMENT_FORMAT = "@paceholder/nodeeditor-js/fragment";
export const FRAGMENT_VERSION = 1;

/** A connection with exactly one end (or none) among the copied nodes, by original IDs. */
export type ExternalConnection = ConnectionSnapshot;

export interface ClipboardFragment {
  readonly format: typeof FRAGMENT_FORMAT;
  readonly version: typeof FRAGMENT_VERSION;
  /** Nodes in paint order, internal connections in collection order. */
  readonly fragment: GraphSnapshot;
  /** Collection order. */
  readonly external: readonly ExternalConnection[];
}

export type { ExcludedReference };
