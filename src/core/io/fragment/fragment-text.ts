/**
 * Clipboard text for fragments.
 *
 * The text is the JSON envelope, written with a fixed key order so equal fragments give
 * equal text. Parsing treats its input as untrusted: the length is checked before
 * `JSON.parse`, text without the format marker is refused as `not-a-fragment` (never
 * guessed at), the inner fragment goes through the one snapshot validator in fragment
 * mode with size limits, and payloads must decode through their codecs. Every error is
 * reported, sorted by JSON path. Bad input never throws.
 */
import { err, ok, type Result } from "../../base/result.js";
import type { Payload } from "../../data/model/records.js";
import { cloneJson } from "../snapshot/json-value.js";
import { parseConnection } from "../snapshot/parse-connection.js";
import { isObj } from "../snapshot/parse-fields.js";
import {
  createErrorSink,
  type ErrorSink,
  guarded,
  type PayloadCodecRegistry,
  prefixedSink,
  resolveLimits,
  runCodec,
  type SnapshotLimits,
} from "../snapshot/snapshot-errors.js";
import {
  FORMAT_VERSION,
  type GraphSnapshot,
  SNAPSHOT_FORMAT,
  type SnapshotError,
} from "../snapshot/snapshot-types.js";
import { validateSnapshotInto } from "../snapshot/validate.js";
import {
  type ClipboardFragment,
  type ExternalConnection,
  FRAGMENT_FORMAT,
  FRAGMENT_VERSION,
} from "./fragment-types.js";

export interface FragmentParseOptions {
  /** Size limits for untrusted input; `maxDocumentChars` bounds the text length. */
  readonly limits?: Partial<SnapshotLimits>;
  readonly codecs?: PayloadCodecRegistry;
}

/** A validated fragment plus its decoded payloads, one per node in fragment order. */
export interface ReadFragment {
  readonly fragment: ClipboardFragment;
  readonly payloads: readonly Payload[];
}

type Parsed<T> = Result<T, readonly SnapshotError[]>;

const ENVELOPE_KEYS = ["format", "version", "fragment", "external"];

const fail = (
  code: SnapshotError["code"],
  message: string,
  path = "",
): Parsed<never> => err([{ code, message, path, entities: [] }]);

const NOT_A_FRAGMENT = "The text holds no graph fragment";

/** Rebuild with the fixed key order of `records.ts`. */
function ordered(fragment: ClipboardFragment): ClipboardFragment {
  const inner: GraphSnapshot = {
    format: SNAPSHOT_FORMAT,
    version: FORMAT_VERSION,
    nodes: fragment.fragment.nodes,
    connections: fragment.fragment.connections,
  };
  return {
    format: FRAGMENT_FORMAT,
    version: FRAGMENT_VERSION,
    fragment: inner,
    external: fragment.external,
  };
}

export function fragmentToText(fragment: ClipboardFragment): string {
  return JSON.stringify(ordered(fragment));
}

function decodePayloads(
  snapshot: GraphSnapshot,
  codecs: PayloadCodecRegistry | undefined,
  sink: ErrorSink,
): Payload[] {
  return snapshot.nodes.map((node, i) => {
    const codec = codecs?.get(node.type);
    if (!codec) return cloneJson(node.payload);
    const decoded = runCodec(() => codec.decode(node.payload));
    if (decoded.ok) return decoded.value;
    sink.add(
      decoded.error.code,
      decoded.error.message,
      `fragment.nodes[${i}].payload`,
      [node.id, ...decoded.error.entities],
    );
    return null;
  });
}

/** Validate an envelope object and decode its payloads. Never throws. */
export function readFragment(
  value: unknown,
  options: FragmentParseOptions = {},
): Parsed<ReadFragment> {
  return guarded(() => readEnvelope(value, options));
}

function readEnvelope(
  value: unknown,
  options: FragmentParseOptions,
): Parsed<ReadFragment> {
  if (!isObj(value) || value.format !== FRAGMENT_FORMAT) {
    return fail("not-a-fragment", NOT_A_FRAGMENT, "format");
  }
  if (value.version !== FRAGMENT_VERSION) {
    return fail(
      "unsupported-version",
      `Fragment version ${String(value.version)} is not supported; this library reads version ${FRAGMENT_VERSION}`,
      "version",
    );
  }
  const limits = resolveLimits(options.limits);
  const sink = createErrorSink(limits.maxErrors);
  for (const key of Object.keys(value)) {
    if (!ENVELOPE_KEYS.includes(key)) {
      sink.add("invalid-shape", `Unknown key "${key}"`, key);
    }
  }
  const external: ExternalConnection[] = [];
  const rawExternal = value.external ?? [];
  if (!Array.isArray(rawExternal)) {
    sink.add("invalid-shape", "external must be an array", "external");
  } else if (rawExternal.length > limits.maxConnections) {
    sink.add(
      "limit-exceeded",
      `external holds ${rawExternal.length} entries; the limit is ${limits.maxConnections}`,
      "external",
    );
  } else {
    rawExternal.forEach((entry: unknown, i: number) => {
      const c = parseConnection(entry, `external[${i}]`, limits, sink);
      if (c) external.push(c);
    });
  }
  const validated = validateSnapshotInto(
    value.fragment,
    { fragment: true, limits },
    prefixedSink(sink, "fragment"),
  );
  if (!validated) return err(sink.report());
  const payloads = decodePayloads(validated, options.codecs, sink);
  if (sink.count() > 0) return err(sink.report());
  return ok({
    fragment: ordered({
      format: FRAGMENT_FORMAT,
      version: FRAGMENT_VERSION,
      fragment: validated,
      external,
    }),
    payloads,
  });
}

/** Validate an envelope that is already an object (a host's own value, a parsed text). */
export function parseFragmentValue(
  value: unknown,
  options: FragmentParseOptions = {},
): Parsed<ClipboardFragment> {
  const read = readFragment(value, options);
  return read.ok ? ok(read.value.fragment) : read;
}

export function parseFragmentText(
  text: unknown,
  options: FragmentParseOptions = {},
): Parsed<ClipboardFragment> {
  if (typeof text !== "string") {
    return fail("not-a-fragment", NOT_A_FRAGMENT);
  }
  const max = resolveLimits(options.limits).maxDocumentChars;
  if (text.length > max) {
    return fail(
      "limit-exceeded",
      `Clipboard text has ${text.length} characters; the limit is ${max}`,
    );
  }
  // Cheap marker check first: ordinary text never reaches the JSON parser.
  if (!text.includes(FRAGMENT_FORMAT)) {
    return fail("not-a-fragment", NOT_A_FRAGMENT);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return fail("not-a-fragment", NOT_A_FRAGMENT);
  }
  return parseFragmentValue(parsed, options);
}
