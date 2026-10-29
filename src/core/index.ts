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
export type {
  NodeTypeDefinition,
  PortSpec,
} from "./data/node-types/definition.js";
export { defaultLimit } from "./data/node-types/definition.js";
export type { UnknownTypeDiagnostic } from "./data/node-types/diagnostics.js";
export { findUnknownTypes } from "./data/node-types/diagnostics.js";
export type { NodeTypeRegistry } from "./data/node-types/registry.js";
export { createNodeTypeRegistry } from "./data/node-types/registry.js";
export { invertPatch } from "./data/patch/invert.js";
export type {
  AppliedPatch,
  ChangedIds,
  ChangeOrigin,
  ConnectionFieldChanges,
  EntityKind,
  FieldChange,
  NodeFieldChanges,
  Patch,
  PatchOp,
  PortFieldChanges,
} from "./data/patch/types.js";
export type {
  PatchValidator,
  ValidationContext,
} from "./data/patch/validator.js";
export type { DocumentReplacement } from "./edit/adapter/replace-document.js";
export type {
  Accepted,
  Deferred,
  HistoryState,
  ModelAdapter,
  OperationId,
  Rejected,
  Revision,
  Submission,
  SubmitResult,
  UnknownOutcome,
} from "./edit/adapter/types.js";
export { resolveCapability } from "./edit/capabilities/resolve.js";
export type {
  CapabilityContext,
  CapabilityPolicy,
} from "./edit/capabilities/types.js";
export type {
  CommandApi,
  CommandEnvironment,
  CommandHost,
} from "./edit/commands/api.js";
export type { ConvenienceMethods } from "./edit/commands/convenience.js";
export type {
  Availability,
  ChoiceAlternative,
  Command,
  CommandKind,
  EntityIds,
  ExecuteResult,
  PlanEffects,
  PlanResult,
  PortEdit,
} from "./edit/commands/types.js";
export type {
  ChangeEvent,
  FailureEvent,
  HistoryEvent,
  ModelEventMap,
  ModelEventType,
  ResetEvent,
  Unsubscribe,
} from "./edit/events/types.js";
export type { DefaultPolicyOptions } from "./edit/policy/default-policy.js";
export { createDefaultConnectionPolicy } from "./edit/policy/default-policy.js";
export type {
  ConnectionPlan,
  ConnectionPolicy,
  ConnectionProposal,
  PolicyOutcome,
} from "./edit/policy/types.js";
export type {
  GraphModel,
  GraphModelCore,
  GraphModelOptions,
  SubmitOptions,
} from "./graph-model.js";
export { createGraphModel } from "./graph-model.js";

export const FORMAT_VERSION = 1;
