# AGENTS.md — start here

Curves: a Linear clone built agent-first. **Status: Phase 0 complete — scaffold, guardrails, and the verification ladder are live; next: [Phase 1](docs/phases/01-domain-data.md).**

1. Read [PLAN.md](PLAN.md) — master plan: stack, layout, global rules, phase index.
2. Your work belongs to exactly one phase: `docs/phases/`.
3. Phase 0 is complete (see its [guard-proofs report](docs/phases/reports/phase-0-guard-proofs.md)). Do not start a phase before the previous one's acceptance criteria pass.

## Repo contract (summary — PLAN.md is authoritative)

- Verification ladder (all green as of Phase 0, `verify:full` ≈ 6 s): `pnpm check` → `pnpm verify` → `pnpm verify:full` (+ `pnpm test:file <path>`). Pre-commit hook = Biome on staged files only; everything else is CI.
- Definition of done: ladder green + the touched surface observed running (browser/DB) + docs touched.
- TypeScript strictest; no `any`; branded IDs; zod only at boundaries; business logic lives in `packages/domain`, never in routers or components.
- Never edit: applied migrations, CI thresholds.
- A decision the plan doesn't cover → write a short ADR in `docs/adr/` and proceed.

## Tools (pstack — see PLAN.md "Agent tooling" and [ADR 0004](docs/adr/0004-agent-tooling-pstack.md))

- Phase-end gate: `/interrogate` · bug fixes: `/tdd` · cross-boundary slices: `/architect` (checkpoint) · design alternatives: `/arena` · recurring mistakes: `/correct`
- Prove UI work: run the project verification skill `.agents/skills/verify-curves/` and keep its evidence.
- Durable decisions: append one row to `decisions.tsv` (repo root, append-only).

## Asking for a human

Only for: credentials/secrets, production or destructive operations, breaking a prior phase's contract. Everything else: proceed and record.
