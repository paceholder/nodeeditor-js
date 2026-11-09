/**
 * Timers and abort controllers for the verdict cache.
 *
 * Core is typechecked without DOM or Node types, so neither `setTimeout` nor
 * `AbortController` is declared here. Both are looked up on the global object when they
 * are used (so test fakes installed later are honoured) unless the caller injects its own.
 */
import { MisuseError } from "../../base/result.js";
import type { AbortSignalLike } from "./verdict-types.js";

export interface VerdictTimers {
  setTimeout(run: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

export interface AbortControllerLike {
  readonly signal: AbortSignalLike;
  abort(): void;
}

interface Globals {
  setTimeout?: (run: () => void, ms: number) => unknown;
  clearTimeout?: (handle: unknown) => void;
  AbortController?: new () => AbortControllerLike;
}

const globals = globalThis as unknown as Globals;

export const globalTimers: VerdictTimers = {
  setTimeout(run, ms) {
    if (!globals.setTimeout) {
      throw new MisuseError(
        "A validator timeout needs setTimeout: inject `timers` in this environment",
      );
    }
    return globals.setTimeout(run, ms);
  },
  clearTimeout(handle) {
    globals.clearTimeout?.(handle);
  },
};

export function globalAbortController(): AbortControllerLike {
  if (!globals.AbortController) {
    throw new MisuseError(
      "The host validator needs AbortController: inject `createAbortController` in this environment",
    );
  }
  return new globals.AbortController();
}
