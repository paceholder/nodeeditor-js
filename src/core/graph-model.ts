/**
 * The model facade.
 *
 * `createGraphModel()` bundles a local adapter, the read model, events and history behind
 * one object. Every edit goes through `submit(patch)`; undo and redo use the same
 * pipeline. Expected failures come back as `Rejected` results. Only programmer misuse
 * (a disposed model, a value that is not a patch) throws `MisuseError`.
 */

import type { IdCursor, IdGenerator } from "./base/ids/id-generator.js";
import type { NodeId } from "./base/ids/ids.js";
import { MisuseError } from "./base/result.js";
import type { Revision } from "./base/revision.js";
import type { GraphReader } from "./data/model/reader.js";
import {
  createNodeTypeRegistry,
  type NodeTypeRegistry,
} from "./data/node-types/registry.js";
import type { Patch } from "./data/patch/types.js";
import type { PatchValidator } from "./data/patch/validator.js";
import {
  createLocalAdapter,
  type LocalAdapter,
  type LocalAdapterOptions,
} from "./edit/adapter/local-adapter.js";
import type { DocumentReplacement } from "./edit/adapter/replace-document.js";
import type {
  HistoryState,
  OperationId,
  SubmitResult,
} from "./edit/adapter/types.js";
import type { CapabilityPolicy } from "./edit/capabilities/types.js";
import { createCapabilityValidator } from "./edit/capabilities/validator.js";
import { type CommandApi, createCommandApi } from "./edit/commands/api.js";
import {
  type ConvenienceMethods,
  createConvenience,
} from "./edit/commands/convenience.js";
import {
  type ResolvedSizeLimits,
  resolveSizeLimits,
  type SizeLimitPolicy,
} from "./edit/commands/size-limits.js";
import type { EventHub } from "./edit/events/event-hub.js";
import { createDefaultConnectionPolicy } from "./edit/policy/default-policy.js";
import { touchedBy } from "./edit/policy/touched-entities.js";
import type { ConnectionPolicy } from "./edit/policy/types.js";
import { createValidatedPolicy } from "./edit/policy/validated-policy.js";
import { createPolicyValidator } from "./edit/policy/validator.js";
import {
  createVerdictCache,
  type VerdictRequestOptions,
  type VerdictService,
} from "./edit/policy/verdict-cache.js";
import type {
  ConnectionValidator,
  VerdictProposal,
} from "./edit/policy/verdict-types.js";
import { createFragmentPlanners } from "./io/fragment/plan-paste.js";
import type {
  PayloadCodecRegistry,
  SnapshotLimits,
} from "./io/snapshot/snapshot-errors.js";

export interface GraphModelOptions extends LocalAdapterOptions {
  /** Node types known to this model. Defaults to an empty registry. */
  readonly registry?: NodeTypeRegistry;
  /** Replaces the default connection policy. */
  readonly connectionPolicy?: ConnectionPolicy;
  /**
   * Asks the host whether a connection plan is acceptable. The model keeps the
   * answers in a cache that its policy reads; `model.verdicts` is how they are requested.
   */
  readonly connectionValidator?: ConnectionValidator;
  /** How long to wait for the validator; there is no default. */
  readonly timeoutMs?: number;
  /** Host layer of capability resolution. */
  readonly capabilityPolicy?: CapabilityPolicy;
  /** Denies every edit while reads keep working. */
  readonly readOnly?: boolean;
  /** Host refinement of node types' size limits, per node. */
  readonly sizeLimits?: SizeLimitPolicy;
  /** Codecs for non-JSON payloads in pasted and duplicated fragments. */
  readonly payloadCodecs?: PayloadCodecRegistry;
  /** Size limits for pasted fragments. Defaults to `DEFAULT_SNAPSHOT_LIMITS`. */
  readonly fragmentLimits?: Partial<SnapshotLimits>;
}

export interface SubmitOptions {
  /** Human-readable description for the history entry. Defaults to "Edit". */
  readonly label?: string;
  /** `skip` applies the edit without a history entry. Defaults to `record`. */
  readonly history?: "record" | "skip";
  /** Defaults to a freshly minted ID. */
  readonly operationId?: OperationId;
  /**
   * The revision the patch was planned against; defaults to the current revision. Any
   * other value is rejected with `stale-revision` and nothing changes.
   */
  readonly baseRevision?: Revision;
}

export interface GraphModelCore {
  /** Synchronous read model; always reflects committed state. */
  readonly reader: GraphReader;
  readonly idGenerator: IdGenerator;
  /**
   * Apply a patch atomically. Outcomes: `accepted` (committed, the reader already shows
   * it), `rejected` (nothing changed; see `rejection`), or `queued` when called from inside
   * an event handler (applied after the current dispatch; await `settled`). Check
   * `status`: a queued result has no `ok`.
   */
  submit(patch: Patch, options?: SubmitOptions): SubmitResult;
  undo(): SubmitResult;
  redo(): SubmitResult;
  historyState(): HistoryState;
  on: EventHub["on"];
  addValidator(validator: PatchValidator): () => void;
  idCursor(): IdCursor;
  revision(): Revision;
  /**
   * Low-level whole-document replacement used by `loadSnapshot`. It checks its records
   * before changing anything and throws `MisuseError` for bad input or when called from
   * inside an event handler; hosts should call `loadSnapshot`, which reports problems in
   * untrusted input as results instead.
   */
  replaceDocument(replacement: DocumentReplacement): Revision;
  /** Release handlers and history. Later calls (except `dispose`) throw `MisuseError`. */
  dispose(): void;
}

export interface GraphModel
  extends GraphModelCore,
    CommandApi,
    ConvenienceMethods {
  readonly registry: NodeTypeRegistry;
  /**
   * The verdicts of the host validator, present when the model was created with a
   * `connectionValidator`. Every view on this model shares them.
   */
  readonly verdicts?: VerdictService;
  /**
   * Obtain the missing host verdicts, normally the `missing` list of an `unverified`
   * result, and resolve once every one has settled, so the same command can be repeated.
   * Resolves at once for a model without a validator.
   */
  verifyConnections(
    proposals: readonly VerdictProposal[],
    options?: VerdictRequestOptions,
  ): Promise<void>;
  /** The codecs paste and duplicate use; copy should pass the same ones. */
  readonly payloadCodecs?: PayloadCodecRegistry;
  /** The fragment limits paste uses. */
  readonly fragmentLimits?: Partial<SnapshotLimits>;
  /**
   * The size limits resize commands check for a node: the library default,
   * the type's `sizeLimits`, then the host hook. `undefined` for an unknown node.
   */
  sizeLimits(id: NodeId): ResolvedSizeLimits | undefined;
}

export function createGraphModel(options: GraphModelOptions = {}): GraphModel {
  const adapter: LocalAdapter = createLocalAdapter(options);
  const registry = options.registry ?? createNodeTypeRegistry();
  const basePolicy =
    options.connectionPolicy ?? createDefaultConnectionPolicy();
  const cache = options.connectionValidator
    ? createVerdictCache({
        validator: options.connectionValidator,
        revision: () => adapter.revision(),
        ...(options.timeoutMs === undefined
          ? {}
          : { timeoutMs: options.timeoutMs }),
      })
    : undefined;
  const policy = cache ? createValidatedPolicy(basePolicy, cache) : basePolicy;
  // Cleared at commit, before any event or queued edit, so no stale verdict judges one.
  if (cache) {
    adapter.onCommit((notice) =>
      notice.kind === "change"
        ? cache.invalidate(touchedBy(notice.patch))
        : cache.reset(),
    );
  }
  const builtIn = [
    createCapabilityValidator({
      readOnly: () => options.readOnly === true,
      ...(options.capabilityPolicy ? { policy: options.capabilityPolicy } : {}),
      typeDefaults: (type) => registry.get(type)?.capabilities,
    }),
    createPolicyValidator(policy),
  ];
  for (const validator of builtIn) adapter.addValidator(validator);
  const core = buildCore(adapter);
  const api = createCommandApi(
    {
      reader: adapter.reader,
      idGenerator: adapter.idGenerator,
      idCursor: () => adapter.planningCursor(),
      submit: (patch, o) => core.submit(patch, o),
      undo: () => adapter.undo(),
      redo: () => adapter.redo(),
      historyState: () => adapter.historyState(),
      mintOperationId: () => adapter.mintOperationId(),
      reportRejection: (id, rejection) =>
        adapter.reportRejection(id, rejection),
    },
    {
      registry,
      policy,
      validators: () => adapter.validators(),
      ...(options.sizeLimits ? { sizeLimits: options.sizeLimits } : {}),
      fragments: createFragmentPlanners({
        ...(options.payloadCodecs ? { codecs: options.payloadCodecs } : {}),
        ...(options.fragmentLimits ? { limits: options.fragmentLimits } : {}),
      }),
    },
  );
  return {
    ...core,
    ...api,
    ...createConvenience(api),
    registry,
    async verifyConnections(proposals, requestOptions) {
      if (!cache) return;
      await Promise.all(
        proposals.map((p) =>
          cache.request(
            {
              from: p.from,
              to: p.to,
              connectionKind: p.kind,
              auxiliary: [],
            },
            requestOptions,
          ),
        ),
      );
    },
    dispose() {
      cache?.dispose();
      core.dispose();
    },
    ...(cache
      ? {
          verdicts: {
            lookup: cache.lookup,
            request: cache.request,
            cancel: cache.cancel,
            release: cache.release,
            forgetFailures: cache.forgetFailures,
            subscribe: cache.subscribe,
          },
        }
      : {}),
    sizeLimits(id) {
      const node = adapter.reader.getNode(id);
      return node
        ? resolveSizeLimits(node, registry, options.sizeLimits)
        : undefined;
    },
    ...(options.payloadCodecs ? { payloadCodecs: options.payloadCodecs } : {}),
    ...(options.fragmentLimits
      ? { fragmentLimits: options.fragmentLimits }
      : {}),
  };
}

function buildCore(adapter: LocalAdapter): GraphModelCore {
  return {
    reader: adapter.reader,
    idGenerator: adapter.idGenerator,
    submit(patch, o = {}) {
      if (
        typeof patch !== "object" ||
        patch === null ||
        !Array.isArray(patch.ops)
      ) {
        throw new MisuseError("submit expects a patch with an ops array");
      }
      return adapter.submit({
        operationId: o.operationId ?? adapter.mintOperationId(),
        baseRevision: o.baseRevision ?? adapter.revision(),
        patch,
        label: o.label ?? "Edit",
        history: o.history ?? "record",
        origin: "local",
      });
    },
    undo: () => adapter.undo(),
    redo: () => adapter.redo(),
    historyState: () => adapter.historyState(),
    on: (type, handler) => adapter.on(type, handler),
    addValidator: (validator) => adapter.addValidator(validator),
    idCursor: () => adapter.idCursor(),
    revision: () => adapter.revision(),
    replaceDocument: (replacement) => adapter.replaceDocument(replacement),
    dispose: () => adapter.dispose(),
  };
}
