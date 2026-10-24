# ADR 0005 — Issue ordering scheme: serialized double midpoints with rebalance

**Status:** accepted — 2026-10-24, during Phase 1.

## Context

Phase 1 needs `orderBetween(prev, next)` for drag/keyboard reorder within and across groups, with `needsRebalance` + `rebalance` (docs/design/CORE_MODEL.md §4). The phase doc prescribed resolving this via `/arena` (parallel sketches + a different-family judge); this environment's subagent slots are single-occupancy, so a true arena did not run — the alternatives are reasoned here instead, and the revisit trigger below is the honest escape hatch.

## Alternatives considered

1. **Arbitrary-precision fraction strings** (Figma/LexoRank-style): midpoint math on bigint fractions, no rebalance ever. Cost: substantially more code (fraction arithmetic + serialization), harder to debug by eye; precision is infinite where our scale doesn't need it.
2. **Serialized double midpoints with rebalance** (chosen): `orderBetween` = numeric midpoint serialized as a string; rebalance when adjacent keys collide or the gap drops under a threshold. ~53 bits of mantissa ≈ 2^52 halvings at the *same* position before precision exhausts — far beyond realistic drag traffic; rebalance is a cheap local respacing.
3. **Integer gaps with spread renumbering** (classic Trello-style): simplest math, but rebalances fire far more often (any gap of 1 exhausted) and touch more rows per rebalance.

## Decision

- `OrderKey = Brand<string, "OrderKey">`; the string is the serialization of a finite double (via `String(x)`), compared numerically after parsing — the string form is opaque to callers.
- `orderBetween(prev: OrderKey | null, next: OrderKey | null): OrderKey` — both null → base key; prev only → prev + 1; next only → next − 1; both → midpoint, and when the midpoint collides with an endpoint (precision exhausted) it returns a key equal to `prev` as a collision signal.
- `needsRebalance(keys): boolean` — duplicates or any adjacent gap < 1e-6.
- `rebalance(count): OrderKey[]` — even spacing over [0, count).
- Determinism: pure functions, no clock, no rng.

## Consequences

- Rebalance is an explicit, testable domain event; the repo layer applies it transactionally when `needsRebalance` fires after a move.
- Migration path to fraction strings (alternative 1) is narrow: `OrderKey` stays an opaque branded string, so only the three functions change. **Revisit trigger:** rebalances exceed ~0.1% of moves in practice, or any precision bug is observed.

**Update (2026-10-24, phase-1 review finding S4):** the repo-side transactional rebalance described under Consequences is deferred to Phase 4, where `move()` gets its drag-reorder callers — today `move()` writes the key and the caller is responsible for checking `needsRebalance`. Nothing else in the decision changes.
