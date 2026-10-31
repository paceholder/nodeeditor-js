// Public clipboard fragment API (EDT-03, EDT-03a, EDT-04, EDT-05).

export type {
  ExtractedFragment,
  ExtractOptions,
  FragmentSelection,
} from "./extract.js";
export { extractFragment } from "./extract.js";
export type { FragmentParseOptions } from "./fragment-text.js";
export {
  fragmentToText,
  parseFragmentText,
  parseFragmentValue,
} from "./fragment-text.js";
export type {
  ClipboardFragment,
  ExcludedReference,
  ExternalConnection,
} from "./fragment-types.js";
export { FRAGMENT_FORMAT, FRAGMENT_VERSION } from "./fragment-types.js";
