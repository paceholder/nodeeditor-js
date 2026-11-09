/**
 * The pending connection choice (D4). A release on a choice target hands
 * the policy alternatives here; this asks the host chooser and waits. It lives outside
 * the tool router, because no pointer is down while the host decides. The answer is
 * applied only while its token is current: choosing commits one `connect` naming the
 * policy key, and every other exit (decline, a failing chooser, an unknown key, cancel,
 * removal of an involved port, a new chooser, dispose) aborts the signal and commits
 * nothing. The preview stays until either. DOM-free; the mount wiring supplies the host.
 *
 * With a host validator, the picked alternative is a plan nobody has judged: instead of
 * committing at once the choice asks for its verdict and waits, with the target
 * drawn as pending and the same cancellations as the pick; it commits when the verdict
 * settles and the model reports any refusal. Like a connect gesture that waits,
 * that wait also ends when a port or node of the picked connection is removed or changed
 * from outside, and the host is told why; its own commit never cancels it.
 */
import type { Command, Point } from "../../../core/index.js";
import type {
  ChoiceRelease,
  GestureCancellation,
} from "../tools/tool-types.js";
import { choiceOptions } from "./choice-request.js";
import type {
  ConnectionChoiceRequest,
  ConnectionChooser,
} from "./choice-types.js";

interface ChoiceOpen {
  readonly token: number;
  readonly request: ConnectionChoiceRequest;
  readonly controller: AbortController;
  /** Node and port IDs whose removal cancels the choice. */
  readonly ids: ReadonlySet<string>;
}

export type ChoiceState =
  | { readonly kind: "idle" }
  | ({ readonly kind: "pending" } & ChoiceOpen)
  /** The host picked; the picked connection waits for its host verdict. */
  | ({ readonly kind: "verifying"; readonly command: Command } & ChoiceOpen);

/** The host verdict service as the choice sees it; omitted without a validator. */
export interface ChoiceVerification {
  /** Whether the command still lacks a host verdict (it would plan as pending). */
  awaiting(command: Command): boolean;
  /** Ask the validator for the command's verdict; joins a request in flight. */
  request(command: Command): void;
  /** Redraw the preview with the target pending. */
  showPending(request: ConnectionChoiceRequest): void;
  /** The wait is over, committed or not: drop requests nobody wants and failures. */
  ended(): void;
}

export interface ConnectionChoiceHost {
  /** Plan and submit through the same path as tool commits. */
  commit(command: Command): void;
  clearPreview(): void;
  /** A waiting pick ended because of a model change, not the user. */
  cancelled?(cancellation: GestureCancellation): void;
  readonly verification?: ChoiceVerification;
  /** Client and viewport positions of a world point, for the request. */
  place(world: Point<"world">): {
    readonly client: { readonly x: number; readonly y: number };
    readonly viewport: Point<"viewport">;
  };
}

export interface ConnectionChoice {
  /** Ask the chooser about a release; without one the preview just clears. */
  open(release: ChoiceRelease): void;
  /** End a pending choice with nothing committed. */
  cancel(): void;
  /** A host verdict settled: a picked connection that waited for it is committed. */
  verdictSettled(): void;
  /** Cancel when a removed ID is the source or target node or port. */
  entitiesRemoved(ids: readonly string[]): void;
  /**
   * Entities were changed from outside the editor (an external change): a picked
   * connection that waits for its verdict is cancelled when one of its ports or nodes is
   * among them. A choice the host is still deciding is unaffected.
   */
  externallyChanged(ids: readonly string[]): void;
  pending(): boolean;
  installed(): boolean;
  /** Replace or remove the chooser; a pending choice is cancelled. */
  setChooser(chooser: ConnectionChooser | undefined): void;
  dispose(): void;
}

const IDLE: ChoiceState = { kind: "idle" };

export function createConnectionChoice(
  host: ConnectionChoiceHost,
  initial?: ConnectionChooser,
): ConnectionChoice {
  let chooser = initial;
  let state: ChoiceState = IDLE;
  let tokens = 0;

  /** Leave the pending or verifying state; abort the signal unless a choice was made. */
  function finish(aborted: boolean, command?: Command): void {
    if (state.kind === "idle") return;
    const { controller } = state;
    state = IDLE;
    if (aborted) controller.abort();
    host.clearPreview();
    // Commit before the verification ends: ending forgets failed verdicts, and the
    // commit must still see them to report the validator's own reason.
    if (command) host.commit(command);
    host.verification?.ended();
  }

  function answer(token: number, key: string | undefined): void {
    if (state.kind !== "pending" || state.token !== token) return;
    const { request } = state;
    const option = request.options.find((o) => o.key === key);
    if (!option) {
      finish(true);
      return;
    }
    const command: Command = {
      kind: "connect",
      from: request.source,
      to: request.target,
      connectionKind: option.connectionKind,
      choice: option.key,
    };
    const verification = host.verification;
    if (verification?.awaiting(command)) {
      state = { ...state, kind: "verifying", command };
      verification.showPending(request);
      verification.request(command);
      return;
    }
    finish(false, command);
  }

  const choice: ConnectionChoice = {
    open(release) {
      finish(true);
      if (!chooser) {
        host.clearPreview();
        return;
      }
      const token = ++tokens;
      const controller = new AbortController();
      const request: ConnectionChoiceRequest = {
        source: release.source,
        target: release.target,
        options: choiceOptions(release.alternatives),
        ...host.place(release.at),
        world: release.at,
        signal: controller.signal,
      };
      const { source, target } = release;
      state = {
        kind: "pending",
        token,
        request,
        controller,
        ids: new Set([source.node, source.port, target.node, target.port]),
      };
      let result: ReturnType<ConnectionChooser>;
      try {
        result = chooser(request);
      } catch {
        answer(token, undefined);
        return;
      }
      // A synchronous answer applies within this call (host rules, tests).
      if (result === undefined || typeof result === "string") {
        answer(token, result);
      } else {
        result.then(
          (key) => answer(token, key),
          () => answer(token, undefined),
        );
      }
    },
    cancel: () => finish(true),
    verdictSettled() {
      if (state.kind !== "verifying") return;
      const { command } = state;
      if (host.verification?.awaiting(command)) return;
      finish(false, command);
    },
    entitiesRemoved(ids) {
      if (state.kind === "idle") return;
      const open = state.ids;
      const involved = ids.filter((id) => open.has(id));
      if (involved.length === 0) return;
      const waiting = state.kind === "verifying";
      finish(true);
      if (waiting)
        host.cancelled?.({ reason: "entity-removed", ids: involved });
    },
    externallyChanged(ids) {
      if (state.kind !== "verifying") return;
      const open = state.ids;
      const involved = ids.filter((id) => open.has(id));
      if (involved.length === 0) return;
      finish(true);
      host.cancelled?.({ reason: "external-change", ids: involved });
    },
    pending: () => state.kind !== "idle",
    installed: () => chooser !== undefined,
    setChooser(next) {
      finish(true);
      chooser = next;
    },
    dispose() {
      finish(true);
      chooser = undefined;
    },
  };
  return choice;
}
