/** Capability overrides on node records: the known actions and a checked copy. */
import type { CapabilityAction, CapabilityOverrides } from "./records.js";

const ACTIONS: ReadonlySet<string> = new Set<CapabilityAction>([
  "move",
  "resize",
  "rotate",
  "mirror",
  "edit",
  "connect",
  "disconnect",
  "delete",
]);

/** A copy of a capability-override object, or undefined when it is malformed. */
export function copyCapabilities(
  value: unknown,
): CapabilityOverrides | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    return undefined;
  const o = value as Record<string, unknown>;
  const out: Partial<Record<CapabilityAction, boolean>> = {};
  for (const [key, v] of Object.entries(o)) {
    if (!ACTIONS.has(key) || typeof v !== "boolean") return undefined;
    out[key as CapabilityAction] = v;
  }
  return out;
}
