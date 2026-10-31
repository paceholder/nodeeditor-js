/** Public types of the per-view clipboard service (EDT-03, EDT-04, EDT-05, D9). */
import type {
  Availability,
  ChangedIds,
  ExcludedReference,
  GraphReader,
  PayloadCodecRegistry,
  Placement,
  Rejection,
  Result,
  SnapshotLimits,
  Vec2,
} from "../../../core/index.js";
import type { EditableModel } from "../commands/editable-model.js";
import type { SelectionModel } from "../selection/selection-model.js";

/** The two async Clipboard API calls the service uses; `navigator.clipboard` fits. */
export interface SystemClipboard {
  writeText(text: string): Promise<void>;
  readText(): Promise<string>;
}

/** View-level clipboard options (`InputOptions.clipboard`). */
export interface ClipboardOptions {
  /** Placement step in world units for repeated pastes and duplicate. Default 20, 20. */
  readonly step?: Vec2;
  /** External connections on paste and duplicate (EDT-04). Default `exclude`. */
  readonly external?: "exclude" | "preserve";
  /** `false` keeps the clipboard in-app only and never touches the system clipboard. */
  readonly system?: false;
}

/** What a paste or duplicate created, and which external references it left out. */
export interface PasteReport {
  /** `pending` when an external authority has not decided yet. */
  readonly status: "accepted" | "pending";
  readonly created: ChangedIds;
  readonly excluded: readonly ExcludedReference[];
}

export type PasteOutcome = Result<PasteReport, Rejection>;

export interface CopyReport {
  readonly text: string;
  /** External connections listed in the fragment but not copied (EDT-04). */
  readonly excluded: readonly ExcludedReference[];
}

export type CopyOutcome = Result<CopyReport, Rejection>;

export interface ClipboardEventMap {
  copy: CopyReport;
  cut: CopyReport;
  paste: PasteOutcome;
  "clipboard-error": Rejection;
}

/** Synchronous text sink of a native clipboard event (`DataTransfer.setData`). */
export type TextSink = (text: string) => void;

export interface ClipboardService {
  /** Copy the selection: in-app buffer, plus `sink` or the system clipboard. */
  copy(sink?: TextSink): CopyOutcome;
  /** Copy, then delete through the atomic delete. Writes nothing when the delete fails. */
  cut(sink?: TextSink): CopyOutcome;
  /** Paste `text` (a native paste event) or else the in-app buffer. */
  paste(text?: string, placement?: Placement): PasteOutcome;
  duplicate(): PasteOutcome;
  /** The fragment text of the current selection, for a host export dialog. */
  exportText(): Result<string, Rejection>;
  /** Paste text from a host import dialog. */
  importText(text: string, placement?: Placement): PasteOutcome;
  /** Read the system clipboard (may prompt) and paste it. */
  pasteFromSystem(): Promise<PasteOutcome>;
  /** The in-app buffer, if anything was copied. */
  buffer(): string | undefined;
  /**
   * Whether a paste would succeed, by a dry run: of `text` when given, else of the in-app
   * buffer. Text from a native paste event is always worth trying (`text` non-empty).
   */
  canPaste(text?: string): Availability;
  /** Whether duplicating the selected nodes would succeed (dry run). */
  canDuplicate(): Availability;
  on<K extends keyof ClipboardEventMap>(
    type: K,
    handler: (event: ClipboardEventMap[K]) => void,
  ): () => void;
  dispose(): void;
}

export interface ClipboardServiceDeps {
  readonly reader: GraphReader;
  /** Absent for a read-only view: copy works, everything else is refused. */
  readonly model: EditableModel | undefined;
  readonly selection: SelectionModel;
  /** World position of the pointer while it is over the view. */
  readonly pointer: () => Vec2 | undefined;
  readonly system: SystemClipboard | undefined;
  readonly options?: ClipboardOptions;
  readonly codecs?: PayloadCodecRegistry;
  readonly limits?: Partial<SnapshotLimits>;
}
