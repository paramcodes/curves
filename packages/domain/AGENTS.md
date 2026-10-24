# @curves/domain — purity rules

This package is the bottom layer (see PLAN.md dependency direction: domain → ∅).

- Pure logic only: no I/O (no fetch, no fs/net), no database, no frameworks, no auth.
- No clock reads or randomness — time and rng are injected (`Clock`, seeded rng helpers in `src/core/`).
- Zod schemas are allowed (they are the boundary contracts other packages parse with), but this package never *parses at runtime* for its own internal calls.
- Enforced mechanically by the nested `biome.json` (`noRestrictedImports` on all `@curves/*` packages and I/O libs) — its messages say where the logic belongs instead.
- Every invariant ships with unit tests including counter-examples; frozen clock for time math.
