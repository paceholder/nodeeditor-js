/**
 * Independent painter registries.
 *
 * Node painters are keyed by node type, port glyph painters by port type key, connection
 * painters by connection kind; the background painter is a single slot. Lookups never
 * fail: an unregistered key returns the registry's fallback. Geometry lives in the core
 * `GeometryRegistry`, so replacing a painter here never touches geometry and vice versa.
 */
import {
  err,
  ok,
  type Rejection,
  type Result,
  rejectionOf,
} from "../../../core/index.js";
import { paintGrid } from "../primitives/grid.js";
import {
  fallbackConnectionPainter,
  fallbackNodePainter,
  fallbackPortGlyphPainter,
} from "./fallback-painters.js";
import type {
  BackgroundPainter,
  ConnectionPainter,
  NodePainter,
  PortGlyphPainter,
} from "./painter-types.js";

export interface PainterRegistry<T> {
  /** The registered painter, or the fallback. */
  get(key: string): T;
  has(key: string): boolean;
  /** Rejects `duplicate-type` when the key already has a painter. */
  register(key: string, painter: T): Result<void, Rejection>;
  /** Register or overwrite. */
  replace(key: string, painter: T): void;
  /** Called after any registration change; returns an unsubscribe function. */
  onChange(handler: () => void): () => void;
}

export interface PainterSlot<T> {
  get(): T;
  set(value: T): void;
  onChange(handler: () => void): () => void;
}

export interface PainterRegistries {
  readonly nodes: PainterRegistry<NodePainter>;
  readonly portGlyphs: PainterRegistry<PortGlyphPainter>;
  readonly connections: PainterRegistry<ConnectionPainter>;
  readonly background: PainterSlot<BackgroundPainter>;
}

function createRegistry<T>(fallback: T): PainterRegistry<T> {
  const byKey = new Map<string, T>();
  const handlers = new Set<() => void>();
  const notify = (): void => {
    for (const h of [...handlers]) h();
  };
  return {
    get: (key) => byKey.get(key) ?? fallback,
    has: (key) => byKey.has(key),
    register(key, painter) {
      if (byKey.has(key)) {
        return err(
          rejectionOf("duplicate-type", `Painter for "${key}" exists`, [key]),
        );
      }
      byKey.set(key, painter);
      notify();
      return ok(undefined);
    },
    replace(key, painter) {
      byKey.set(key, painter);
      notify();
    },
    onChange(handler) {
      // A wrapper per subscription, so subscribing one function twice unsubscribes once.
      const entry = (): void => handler();
      handlers.add(entry);
      return () => void handlers.delete(entry);
    },
  };
}

function createSlot<T>(initial: T): PainterSlot<T> {
  let value = initial;
  const handlers = new Set<() => void>();
  return {
    get: () => value,
    set(next) {
      value = next;
      for (const h of [...handlers]) h();
    },
    onChange(handler) {
      // A wrapper per subscription, so subscribing one function twice unsubscribes once.
      const entry = (): void => handler();
      handlers.add(entry);
      return () => void handlers.delete(entry);
    },
  };
}

export function createPainterRegistries(): PainterRegistries {
  return {
    nodes: createRegistry<NodePainter>(fallbackNodePainter),
    portGlyphs: createRegistry<PortGlyphPainter>(fallbackPortGlyphPainter),
    connections: createRegistry<ConnectionPainter>(fallbackConnectionPainter),
    background: createSlot<BackgroundPainter>(paintGrid),
  };
}
