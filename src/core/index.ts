// Headless graph model, commands, policies, and serialization.
// Must stay free of DOM, browser globals, and React.

export type { IdCursor, IdGenerator } from "./base/ids/id-generator.js";
export {
  createCounterIdGenerator,
  EMPTY_CURSOR,
} from "./base/ids/id-generator.js";
export type {
  ConnectionId,
  GroupId,
  IdKind,
  MemberKey,
  NodeId,
  PortId,
  ValueId,
} from "./base/ids/ids.js";
export {
  connectionId,
  groupId,
  ID_KINDS,
  isWellFormedId,
  memberKey,
  nodeId,
  portId,
  valueId,
} from "./base/ids/ids.js";
export type { Rejection, RejectionCode, Result } from "./base/result.js";
export { err, MisuseError, ok, reject, rejectionOf } from "./base/result.js";
export type { GraphReader } from "./data/model/reader.js";
export type {
  AttachmentLimit,
  CapabilityAction,
  CapabilityOverrides,
  ConnectionRecord,
  Endpoint,
  NodeRecord,
  Payload,
  PortDirection,
  PortPlacement,
  PortRecord,
} from "./data/model/records.js";
export type { GraphState } from "./data/model/state.js";
export type { StoreOptions } from "./data/model/store.js";
export {
  checkConnectionEndpoints,
  checkPortOwnership,
  type RecordLookup,
  validateConnectionRecord,
  validateNodeRecord,
  validatePortRecord,
} from "./data/model/validate-records.js";
export type { QuarterTurns, Size, Vec2 } from "./data/model/values.js";
export {
  isFiniteSize,
  isFiniteVec2,
  isQuarterTurns,
} from "./data/model/values.js";

export const FORMAT_VERSION = 1;
