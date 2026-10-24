# ADR 0006 — Issue identifier allocation: transactional max+1 with one retry

**Status:** accepted — 2026-10-24, during Phase 1 (with the issue repository, slice 8).

## Context

Every issue gets a human-facing identifier `TEAM-123` (per-team `number` sequence). The domain's `issueIdentifier(teamKey, n)` is pure; allocation — deciding `n` — happens at the storage boundary. Constraints: identifiers must be strictly increasing per team (users rely on them chronologically), never reused (an identifier must not resurrect after delete), and allocation must survive two agents creating issues concurrently. Linear-scale throughput is not a concern at v1.

## Alternatives considered

1. **Postgres sequence per team** — gapless-ish and fast, but one sequence object per team (DDL at team creation), and sequence state drifts from row state after deletes/restores.
2. **UUID-derived numbers** — no coordination at all, but identifiers stop being short/chronological, which defeats their purpose for humans.
3. **`max(number)+1` inside the create transaction, retry on unique violation** (chosen) — one row read under the `(teamId, number)` unique index created in slice 7; a concurrent collision is caught by the index and retried once, then surfaces as `ConflictError`.

## Decision

- `nextNumber(teamId)` = `max(number)+1` (or 1 for an empty team), read inside the same transaction as the insert.
- On unique-violation (concurrent writer won), retry the whole allocation+insert **once**; a second collision throws `ConflictError` (the caller backs off; at our scale two consecutive collisions means something is wrong, not load).
- **Gap policy: gaps are allowed and never backfilled.** A failed transaction or a deleted issue leaves a hole; identifiers are monotonic, not dense. Rationale: backfilling resurrects stale identifiers seen in notifications/chat history — worse than a hole.

## Consequences

- No DDL beyond the existing unique index; allocation cost is one indexed max per create.
- Gaps appear in identifiers after deletes — accepted and documented here for support/FAQ purposes.
- If identifier churn ever matters (it shouldn't at v1 scale), migration path is per-team sequences (alternative 1) without touching the domain layer.
