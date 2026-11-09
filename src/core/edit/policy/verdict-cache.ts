/**
 * The verdict cache.
 *
 * Keeps the host validator's answers by connection plan so the synchronous policy can read
 * them. Evaluating never starts a request: `request` is the only way to call the validator,
 * and it joins a request already in flight for the same plan, so repeated evaluations of one
 * plan cost one round trip.
 *
 * Freshness is decided by change events, not by comparing revisions: `invalidate` marks a
 * verdict stale when a change touched one of the plan's ports or nodes. Unrelated changes
 * keep it. Verdicts are never serialized.
 */
import type { Rejection } from "../../base/result.js";
import type { Revision } from "../../base/revision.js";
import type { Unsubscribe } from "../events/types.js";
import type { TouchedEntities } from "./touched-entities.js";
import type { ConnectionPlan } from "./types.js";
import {
  type AbortControllerLike,
  globalAbortController,
  globalTimers,
  type VerdictTimers,
} from "./verdict-env.js";
import { type VerdictKey, verdictKey } from "./verdict-key.js";
import { describeError, failure, readVerdict } from "./verdict-shape.js";
import type {
  ConnectionValidator,
  ConnectionVerdict,
  VerdictProposal,
  VerdictSignal,
} from "./verdict-types.js";

export interface VerdictCacheOptions {
  readonly validator: ConnectionValidator;
  /** The model's current revision, passed to the validator for its bookkeeping. */
  readonly revision: () => Revision;
  /** There is no default: a validator that never answers stays pending. */
  readonly timeoutMs?: number;
  /** Settled verdicts kept before the least recently used one is dropped. Default 256. */
  readonly capacity?: number;
  readonly timers?: VerdictTimers;
  readonly createAbortController?: () => AbortControllerLike;
}

export type VerdictLookup =
  | { readonly kind: "unknown" }
  | { readonly kind: "pending" }
  | { readonly kind: "valid" }
  | { readonly kind: "invalid"; readonly rejection: Rejection };

export interface VerdictRequestOptions {
  /** Who is asking, so `cancel` and `release` abort only unwanted requests. */
  readonly requester?: object;
  /**
   * Whether the caller still wants this plan. Asked when a verdict arrives stale: if true
   * the plan is requested once more.
   */
  readonly wanted?: () => boolean;
}

export interface VerdictCache {
  lookup(plan: ConnectionPlan): VerdictLookup;
  /**
   * Request the verdict for `plan`, or join the request in flight. Resolves with the
   * verdict, or `undefined` when the request was abandoned (cancelled, dropped as
   * unwanted, reset or disposed). A failed earlier request is retried.
   */
  request(
    plan: ConnectionPlan,
    options?: VerdictRequestOptions,
  ): Promise<ConnectionVerdict | undefined>;
  /** `requester` no longer wants `plan`; the request is aborted when nobody else does. */
  cancel(plan: ConnectionPlan, requester: object): void;
  /** `requester` wants nothing any more (a disposed view). */
  release(requester: object): void;
  /**
   * Drop verdicts that record a validator failure, timeout or staleness. With a
   * `requester`, only the failures it asked for are forgotten, and one that another
   * requester also asked for stays until that one forgets it too; without, all of them.
   */
  forgetFailures(requester?: object): void;
  /** A change touched these entities: stale verdicts go, in-flight ones are discarded. */
  invalidate(touched: TouchedEntities): void;
  /** Called when a verdict settles or an entry the tools may have read goes away. */
  subscribe(listener: () => void): Unsubscribe;
  /** Abort everything, forget everything and ignore answers that arrive later. */
  reset(): void;
  dispose(): void;
}

/** What a tool or host may do with a model's cache; the model keeps the rest to itself. */
export type VerdictService = Pick<
  VerdictCache,
  "lookup" | "request" | "cancel" | "release" | "forgetFailures" | "subscribe"
>;

interface Scope {
  readonly nodes: readonly string[];
  readonly ports: readonly string[];
}

interface Settled {
  readonly state: "settled";
  readonly verdict: ConnectionVerdict;
  /** A validator failure, timeout or staleness rather than an answer. */
  readonly failure: boolean;
  /** Who still wanted the answer when it arrived; a failure is forgotten per asker. */
  readonly askers: Set<object>;
  readonly scope: Scope;
}

interface Flight {
  readonly state: "flight";
  readonly proposal: VerdictProposal;
  readonly scope: Scope;
  /** The plan changed under the request: an answer is discarded. */
  stale: boolean;
  attempt: 1 | 2;
  controller: AbortControllerLike | undefined;
  timer: unknown;
  readonly wants: Map<object, () => boolean>;
  readonly waiters: ((verdict: ConnectionVerdict | undefined) => void)[];
}

type Entry = Settled | Flight;

const DEFAULT_CAPACITY = 256;

export function createVerdictCache(options: VerdictCacheOptions): VerdictCache {
  const capacity = options.capacity ?? DEFAULT_CAPACITY;
  const timers = options.timers ?? globalTimers;
  const makeController = options.createAbortController ?? globalAbortController;
  const entries = new Map<VerdictKey, Entry>();
  const listeners = new Set<() => void>();
  let epoch = 0;
  let disposed = false;

  const notify = () => {
    for (const listener of [...listeners]) listener();
  };

  const scopeOf = (plan: ConnectionPlan): Scope => ({
    nodes: [plan.from.node, plan.to.node],
    ports: [plan.from.port, plan.to.port],
  });

  function endFlight(flight: Flight, result: ConnectionVerdict | undefined) {
    if (flight.timer !== undefined) timers.clearTimeout(flight.timer);
    flight.timer = undefined;
    for (const waiter of flight.waiters.splice(0)) waiter(result);
  }

  function abortFlight(flight: Flight) {
    flight.controller?.abort();
    endFlight(flight, undefined);
  }

  /** Drop the least recently used settled verdicts beyond the capacity; true if any went. */
  function evict(): boolean {
    let dropped = false;
    for (const [key, entry] of entries) {
      if (entries.size <= capacity) break;
      if (entry.state === "settled") {
        entries.delete(key);
        dropped = true;
      }
    }
    return dropped;
  }

  function settle(
    key: VerdictKey,
    flight: Flight,
    verdict: ConnectionVerdict,
    isFailure: boolean,
  ) {
    entries.delete(key);
    entries.set(key, {
      state: "settled",
      verdict,
      failure: isFailure,
      askers: new Set(flight.wants.keys()),
      scope: flight.scope,
    });
    evict();
    endFlight(flight, verdict);
    notify();
  }

  /** An answer, failure or timeout for the current attempt of `flight`. */
  function arrived(
    key: VerdictKey,
    flight: Flight,
    outcome: ConnectionVerdict | Rejection,
  ) {
    if (flight.stale) {
      const wanted = [...flight.wants.values()].some((wants) => wants());
      if (!wanted) {
        entries.delete(key);
        endFlight(flight, undefined);
        notify();
      } else if (flight.attempt === 1) {
        flight.attempt = 2;
        flight.stale = false;
        launch(key, flight);
      } else {
        const stale = failure(
          "validator-stale",
          "The connection changed while it was being validated",
          flight.proposal,
        );
        settle(key, flight, { valid: false, rejection: stale }, true);
      }
      return;
    }
    if ("valid" in outcome) settle(key, flight, outcome, false);
    else settle(key, flight, { valid: false, rejection: outcome }, true);
  }

  function launch(key: VerdictKey, flight: Flight) {
    const generation = epoch;
    const controller = makeController();
    flight.controller = controller;
    let answered = false;
    const finish = (outcome: ConnectionVerdict | Rejection) => {
      if (answered) return;
      answered = true;
      if (flight.timer !== undefined) timers.clearTimeout(flight.timer);
      flight.timer = undefined;
      // Cancelled, dropped, reset or replaced: nobody is waiting for this answer.
      if (generation !== epoch || entries.get(key) !== flight) return;
      arrived(key, flight, outcome);
    };
    if (options.timeoutMs !== undefined) {
      flight.timer = timers.setTimeout(() => {
        controller.abort();
        finish(
          failure(
            "validator-timeout",
            `The validator did not answer within ${options.timeoutMs} ms`,
            flight.proposal,
          ),
        );
      }, options.timeoutMs);
    }
    const crashed = (error: unknown) =>
      finish(
        failure("validator-failed", describeError(error), flight.proposal),
      );
    let reply: Promise<unknown>;
    try {
      reply = Promise.resolve(
        options.validator({
          proposal: flight.proposal,
          revision: options.revision(),
          signal: controller.signal as unknown as VerdictSignal,
        }),
      );
    } catch (error) {
      crashed(error);
      return;
    }
    reply.then((value) => {
      const verdict = readVerdict(value);
      if (verdict) finish(verdict);
      else
        finish(
          failure(
            "validator-failed",
            "The validator answered with something that is not a verdict",
            flight.proposal,
          ),
        );
    }, crashed);
  }

  return {
    lookup(plan) {
      const key = verdictKey(plan);
      const entry = entries.get(key);
      if (!entry) return { kind: "unknown" };
      if (entry.state === "flight") return { kind: "pending" };
      entries.delete(key);
      entries.set(key, entry);
      return entry.verdict.valid
        ? { kind: "valid" }
        : { kind: "invalid", rejection: entry.verdict.rejection };
    },

    request(plan, requestOptions = {}) {
      if (disposed) return Promise.resolve(undefined);
      const key = verdictKey(plan);
      let entry = entries.get(key);
      if (entry?.state === "settled" && entry.failure) {
        entries.delete(key);
        entry = undefined;
      }
      if (entry?.state === "settled") {
        entries.delete(key);
        entries.set(key, entry);
        return Promise.resolve(entry.verdict);
      }
      let flight = entry;
      let evicted = false;
      if (!flight) {
        flight = {
          state: "flight",
          proposal: {
            from: plan.from,
            to: plan.to,
            kind: plan.connectionKind,
          },
          scope: scopeOf(plan),
          stale: false,
          attempt: 1,
          controller: undefined,
          timer: undefined,
          wants: new Map(),
          waiters: [],
        };
        entries.set(key, flight);
        evicted = evict();
      }
      flight.wants.set(
        requestOptions.requester ?? {},
        requestOptions.wanted ?? (() => true),
      );
      const started = flight.controller === undefined;
      const answer = new Promise<ConnectionVerdict | undefined>((resolve) => {
        flight.waiters.push(resolve);
      });
      if (started) launch(key, flight);
      // Told only now, so a listener that asks again finds the request fully started.
      if (evicted) notify();
      return answer;
    },

    cancel(plan, requester) {
      const key = verdictKey(plan);
      const entry = entries.get(key);
      if (entry?.state !== "flight") return;
      entry.wants.delete(requester);
      if (entry.wants.size > 0) return;
      entries.delete(key);
      abortFlight(entry);
    },

    release(requester) {
      for (const [key, entry] of [...entries]) {
        if (entry.state !== "flight" || !entry.wants.delete(requester))
          continue;
        if (entry.wants.size > 0) continue;
        entries.delete(key);
        abortFlight(entry);
      }
    },

    forgetFailures(requester) {
      let dropped = false;
      for (const [key, entry] of [...entries]) {
        if (entry.state !== "settled" || !entry.failure) continue;
        if (requester !== undefined) {
          if (!entry.askers.delete(requester) || entry.askers.size > 0) {
            continue;
          }
        }
        entries.delete(key);
        dropped = true;
      }
      if (dropped) notify();
    },

    invalidate(touched) {
      const hit = (scope: Scope) =>
        scope.ports.some((p) => touched.ports.has(p)) ||
        scope.nodes.some((n) => touched.nodes.has(n));
      let dropped = false;
      for (const [key, entry] of [...entries]) {
        if (!hit(entry.scope)) continue;
        if (entry.state === "flight") entry.stale = true;
        else {
          entries.delete(key);
          dropped = true;
        }
      }
      if (dropped) notify();
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    reset() {
      epoch += 1;
      const dropping = [...entries.values()];
      entries.clear();
      for (const entry of dropping) {
        if (entry.state === "flight") abortFlight(entry);
      }
      notify();
    },

    dispose() {
      if (disposed) return;
      disposed = true;
      epoch += 1;
      const dropping = [...entries.values()];
      entries.clear();
      for (const entry of dropping) {
        if (entry.state === "flight") abortFlight(entry);
      }
      listeners.clear();
    },
  };
}
