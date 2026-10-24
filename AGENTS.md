# AGENTS.md — start here

Curves: a Linear clone built agent-first. **Status: Phase 1 complete — domain model + data layer live (84 domain tests, 36 integration tests, deterministic seed); next: [Phase 2](docs/phases/02-api-auth.md) (API & auth).**

1. Read [PLAN.md](PLAN.md) — master plan: stack, layout, global rules, phase index.
2. Your work belongs to exactly one phase: `docs/phases/`.
3. Phase 0 and Phase 1 are complete (see the [phase-1 exit report](docs/phases/reports/phase-1-exit.md), incl. recorded deferrals: 5 repos → Phase 2 first slice). Do not start a phase before the previous one's acceptance criteria pass.

## Repo contract (summary — PLAN.md is authoritative)

- Verification ladder: `pnpm check` (incl. schema↔migration regen gate) → `pnpm verify` → `pnpm verify:full` (+ `pnpm test:file <path>`, `pnpm db:reset`). Wall clock: `verify:full` ≈ 301 s cold / ≈ 5 s warm (turbo cache; the pglite integration tier dominates cold runs — shrink task in the phase-1 exit report). Pre-commit hook = Biome on staged files only; everything else is CI.
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
