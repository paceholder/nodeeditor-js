/**
 * Keeps the first of several values that are equal by value: an inline object
 * argument, new on every render, gives hooks one identity to depend on. Plain data is
 * compared entry by entry, anything else by identity (see `sameData`).
 */
import { useRef } from "react";
import { sameData } from "./same-data.js";

export function useStableValue<T>(value: T): T {
  const kept = useRef(value);
  if (kept.current !== value && !sameData(kept.current, value)) {
    kept.current = value;
  }
  return kept.current;
}
