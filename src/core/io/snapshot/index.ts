// Public snapshot API.

export type { DiffOptions } from "./diff.js";
export { diffSnapshot } from "./diff.js";
export type {
  DocumentLoadReport,
  LoadDocumentOptions,
  SaveOptions,
} from "./document.js";
export { loadDocument, saveDocument } from "./document.js";
export type {
  DocumentExtras,
  DocumentViewportData as DocumentViewport,
  Migration,
} from "./document-parse.js";
export type { ExportOptions, SnapshotSource } from "./export.js";
export { exportSnapshot } from "./export.js";
export type { JsonProblem, JsonValue } from "./json-value.js";
export { checkJson, jsonEqual } from "./json-value.js";
export type {
  LoadOptions,
  LoadReport,
  PreparedLoad,
  SnapshotTarget,
} from "./load.js";
export { commitLoad, loadSnapshot, prepareLoad } from "./load.js";
export type {
  PayloadCodec,
  PayloadCodecRegistry,
  SnapshotLimits,
} from "./snapshot-errors.js";
export {
  createPayloadCodecRegistry,
  DEFAULT_SNAPSHOT_LIMITS,
} from "./snapshot-errors.js";
export type {
  ConnectionSnapshot,
  EndpointSnapshot,
  GraphSnapshot,
  NodeSnapshot,
  PortSnapshot,
  SnapshotDiagnostic,
  SnapshotError,
} from "./snapshot-types.js";
export {
  DOCUMENT_FORMAT,
  FORMAT_VERSION,
  SNAPSHOT_ERROR_CODES,
  SNAPSHOT_FORMAT,
} from "./snapshot-types.js";
export type { ValidateOptions } from "./validate.js";
export { validateSnapshot } from "./validate.js";
