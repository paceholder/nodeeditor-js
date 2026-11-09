/**
 * Starts and follows host verdict requests for connect gestures (D4, D6).
 *
 * Tool state machines stay pure: they ask for a verdict through the `request-verdict` and
 * `validate-wait` effects, and this driver turns the effect into a call on the model's
 * verdict service. It tells the view when any verdict settles, so pending targets are read
 * again, and when a gesture ends, so requests nobody wants any more are aborted and failed
 * entries are forgotten (a failure blocks a port pair only while the gesture that asked
 * runs). DOM-free; the mount wiring supplies the plan function and the gesture check.
 */
import {
  type Command,
  type ConnectionPlan,
  type Endpoint,
  type PlanResult,
  type VerdictService,
  verdictKey,
} from "../../../core/index.js";

export interface VerdictDriverDeps {
  readonly verdicts: VerdictService;
  /** The model's dry-run planner: a connection awaiting a verdict plans as `pending`. */
  readonly plan: (command: Command) => PlanResult;
  /** Whether a connect gesture is still running (it still wants the verdict it asked for). */
  readonly gestureActive: () => boolean;
  /** A verdict settled or an entry went away: drop cached evaluations and read them again. */
  readonly settled: () => void;
}

export interface VerdictDriver {
  /** Ask the validator about a pair unless it already has a verdict or a request in flight. */
  request(source: Endpoint, target: Endpoint): void;
  /** The same for the plan a connect command leads to (a picked alternative). */
  requestCommand(command: Command): void;
  /** The gesture ended, committed or not. */
  gestureEnded(): void;
  dispose(): void;
}

export function createVerdictDriver(deps: VerdictDriverDeps): VerdictDriver {
  // The cache counts requesters, so a view disposing aborts only what nobody else wants.
  const requester = {};
  const asked = new Map<string, ConnectionPlan>();
  let wanted: string | undefined;
  const off = deps.verdicts.subscribe(deps.settled);
  return {
    request(source, target) {
      this.requestCommand({ kind: "connect", from: source, to: target });
    },
    requestCommand(command) {
      const planned = deps.plan(command);
      const proposal =
        planned.kind === "pending" ? planned.missing[0] : undefined;
      if (!proposal) return;
      const plan: ConnectionPlan = {
        from: proposal.from,
        to: proposal.to,
        connectionKind: proposal.kind,
        auxiliary: [],
      };
      const key = verdictKey(plan);
      wanted = key;
      asked.set(key, plan);
      void deps.verdicts.request(plan, {
        requester,
        // A verdict discarded as stale is asked for once more only while this pair is the
        // one the running gesture shows or waits on and the connection can still be made
        // (a removed port is not asked about).
        wanted: () =>
          deps.gestureActive() &&
          wanted === key &&
          deps.plan(command).kind === "pending",
      });
    },
    gestureEnded() {
      for (const plan of asked.values()) deps.verdicts.cancel(plan, requester);
      asked.clear();
      wanted = undefined;
      // Only what this view asked: another view may still show its own failure.
      deps.verdicts.forgetFailures(requester);
    },
    dispose() {
      off();
      deps.verdicts.release(requester);
      asked.clear();
    },
  };
}
