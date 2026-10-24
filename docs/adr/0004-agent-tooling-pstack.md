# ADR 0004 — Adopting pstack selectively + verification-first workflow rules

**Status:** accepted — 2026-10-24, during planning (no app code exists yet).

## Context

After the Matt Pocock × poteto interview ("shipping 1,000's of PRs a month", Oct 2026) we reviewed our workflows against its takeaways and evaluated the pstack skill collection (already installed globally in this environment; harness-agnostic mirror of Cursor's plugin).

Load-bearing ideas from the interview: the **trust ladder** (delegation size grows with verified trust); **verification as the bottleneck** (Andy Grove's three-minute egg — faster generation is useless while verification is slow); **gardening** (most agent PRs are maintenance; every weed pulled becomes a rule); **"completion needs an observable result"** (more tests ≠ more confidence); **"plan through code"** (long abstract plans give the illusion of progress); the **correction hierarchy** (architecture → lint/CI → skills → human review last); and deliberate deferral of auto-merge/fuzz-swarms until trust and verification exist.

pstack offers: `/poteto-mode` playbooks, per-role model routing (`/setup-pstack`), review panels (`/interrogate`, `/arena`, `/swarm`), a project verification skill generator (`/create-verification-skill` + `/maintain-verification-skill`), `/tdd`, `/architect`, `/correct`, and a decision-log format (`show-me-your-work`).

## Decision

**Workflow rules adopted** (PLAN.md working agreements / definition of done / phase exits):

1. Trust ladder: new task classes start small; delegation grows only after slices pass `verify:full` + runtime surface without human repair.
2. Phase exits record acceptance results, `verify:full` wall-clock (verification speed is a tracked metric), and doc/ADR reconciliation.
3. Definition of done now rejects oracle tests explicitly.
4. Design uncertainty resolves in code (spike / switchable prototype / `/arena`), never another planning doc.
5. Bug fixes test-first where a cheap local test exists.
6. Gardening pass from Phase 3 onward; recurring mistakes become skill edits (`/correct`), never new guardrails.

**pstack usage** (deliberate, not default):

- `/interrogate` as phase-end gate · `/tdd` for bugs · `/architect` (checkpoint) for cross-boundary slices · `/arena` for design alternatives · `/correct` for recurring mistakes.
- Project-local verification skill `.agents/skills/verify-curves/` (verifies the prototype today; regenerated for the real app in Phase 3 via `/create-verification-skill`; maintained at each phase exit).
- Decision log `decisions.tsv` (repo root, append-only, show-me-your-work format).
- `/setup-pstack` config with a cost-conscious budget/role mapping.

**Deferred** (until the verification harness exists and trust is earned): whole-phase `/poteto-mode`, `/swarm`, overnight loops, verifier auto-merge. **Skipped**: pstack planning playbooks (PLAN.md is the plan of record), Cursor-only benny automations, formal verification (revisit Phase 5–6 for rollover idempotency / SSE resync).

## Consequences

- Repo footprint is small: one project skill, one TSV, routing lines — no new CI gates, no new lint rules (consistent with ADR 0002's lean stance).
- Token cost is real for panels; mitigated by budget choice and by using `/interrogate` only at phase ends, not per-commit.
- If pstack habits don't earn their keep, the fallback is trivial: delete the routing lines; the workflow rules (1–6) stand on their own without pstack.
