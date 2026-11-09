/**
 * Default report for errors from host code the view calls (painters, event handlers):
 * rethrow outside the current call stack, so the view's own work finishes first and the
 * error still reaches the console and error monitoring.
 */
export function rethrowLater(error: unknown): void {
  queueMicrotask(() => {
    throw error;
  });
}
