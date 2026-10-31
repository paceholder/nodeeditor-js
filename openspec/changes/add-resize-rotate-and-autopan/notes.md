# Implementation notes

Deviations from design.md, clarifications made while implementing, and observations.

## Deviations and clarifications

- **`DEFAULT_MIN_SIZE` lives in `core/data/node-types/definition.ts`** so the registry
  (core/data) and `size-limits.ts` (core/edit) share the 1 x 1 default.
- **The registry compares `min` with `max` using the default minimum when `min` is
  missing**, so a type declaring only `max: { width: 0.5, ... }` is rejected
  (`malformed-record`) instead of being silently widened later.
- **Size-limit layers replace whole bounds**: a type or hook result that gives `min`
  replaces the whole `min` size (both axes); `max` likewise. `SizeLimits.min` and `max`
  are full `Size` values, so there is no per-axis partial bound.
- **`CommandEnvironment.sizeLimits` is the host hook** (`SizeLimitPolicy`), optional;
  `createCommandApi` resolves it into `PlanContext.sizeLimits(node)`.
- **"Externally applied sizes"** is evidenced with a local adapter that carries the
  capability validator and receives an `origin: "external"` patch: the facade has no
  external-origin submit.
