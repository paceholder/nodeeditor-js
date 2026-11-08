// The bundler replaces `process.env.NODE_ENV`; the library itself needs no Node types.
declare const process: { env: { NODE_ENV?: string } } | undefined;

/** Development-only console warning; silent when `NODE_ENV` is "production". */
export function devWarn(message: string): void {
  if (typeof process !== "undefined" && process.env.NODE_ENV === "production") {
    return;
  }
  console.warn(`[nodeeditor-js] ${message}`);
}
