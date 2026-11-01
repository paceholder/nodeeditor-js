/**
 * The pending connection choice (INT-12a, INT-08, D4). A release on a choice target hands
 * the policy alternatives here; this asks the host chooser and waits. It lives outside
 * the tool router, because no pointer is down while the host decides. The answer is
 * applied only while its token is current: choosing commits one `connect` naming the
 * policy key, and every other exit (decline, a failing chooser, an unknown key, cancel,
 * removal of an involved port, a new chooser, dispose) aborts the signal and commits
 * nothing. The preview stays until either. DOM-free; the mount wiring supplies the host.
 */
import type { Command, Point } from "../../../core/index.js";
import type { ChoiceRelease } from "../tools/tool-types.js";
import { choiceOptions } from "./choice-request.js";
import type {
  ConnectionChoiceRequest,
  ConnectionChooser,
} from "./choice-types.js";

export type ChoiceState =
  | { readonly kind: "idle" }
  | {
      readonly kind: "pending";
      readonly token: number;
      readonly request: ConnectionChoiceRequest;
      readonly controller: AbortController;
      /** Node and port IDs whose removal cancels the choice. */
      readonly ids: ReadonlySet<string>;
    };

export interface ConnectionChoiceHost {
  /** Plan and submit through the same path as tool commits. */
  commit(command: Command): void;
  clearPreview(): void;
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
  /** Cancel when a removed ID is the source or target node or port. */
  entitiesRemoved(ids: readonly string[]): void;
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

  /** Leave the pending state; abort the signal unless a choice was made. */
  function finish(aborted: boolean): void {
    if (state.kind !== "pending") return;
    const { controller } = state;
    state = IDLE;
    if (aborted) controller.abort();
    host.clearPreview();
  }

  function answer(token: number, key: string | undefined): void {
    if (state.kind !== "pending" || state.token !== token) return;
    const { request } = state;
    const option = request.options.find((o) => o.key === key);
    finish(option === undefined);
    if (!option) return;
    host.commit({
      kind: "connect",
      from: request.source,
      to: request.target,
      connectionKind: option.connectionKind,
      choice: option.key,
    });
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
    entitiesRemoved(ids) {
      if (state.kind !== "pending") return;
      const involved = state.ids;
      if (ids.some((id) => involved.has(id))) finish(true);
    },
    pending: () => state.kind === "pending",
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
