# Phase 1 — Domain Model & Data Layer

> Blueprint: [docs/design/CORE_MODEL.md](../design/CORE_MODEL.md) defines the core types, module seams, repo interfaces, and the target file tree this phase builds.

Goal: the entire Linear domain as a typed, migrated, tested data layer — entities, invariants, state machines — with zero UI and zero HTTP. After this phase, "what is a cycle" has exactly one answer, and it lives in `packages/domain`.

## Scope

- **In:** full Drizzle schema + migrations + repositories, pure domain logic, deterministic seed.
- **Out:** API procedures, UI, auth flows (the `users` table exists; sessions arrive in Phase 2).

## Data model (Drizzle schema, `packages/db`)

- `users`, `teams`, `team_members` (role: admin/member)
- `states` — per-team workflow: name, category ∈ {backlog, unstarted, started, completed, canceled}, ordered position
- `labels` (+ team), `issue_labels`
- `issues` — team, per-team sequence number (identifier `ENG-123`), title, description (markdown), priority 0–4 (none/low/medium/high/urgent), estimate, assignee, creator, state, parent (sub-issues), fractional ordering key, timestamps: created/updated/started/completed/canceled/archived
- `issue_relations` — type ∈ {blocks, blocked_by, related}
- `projects` (status, health, target date, lead), `project_issues`, `project_milestones`
- `cycles` (team, number, starts_at, ends_at), `cycle_issues`
- `comments`, `reactions`
- `activities` (actor, entity, verb, payload jsonb) — written by every mutation from Phase 2 onward
- `notifications`, `views` (owner, optional team, filter jsonb, display jsonb)

## Domain logic (`packages/domain`, pure, no I/O)

- Branded IDs for every entity; typed errors (`TransitionNotAllowed`, `DuplicateLabelError`, …), never bare `Error`.
- State machine: legal transitions per category; side effects (completed_at / canceled_at stamping).
- Cycle math: current/upcoming/past classification; rollover policy (incomplete → next cycle | backlog); scope stats (planned, completed, added mid-cycle = scope creep).
- Fractional ordering: key between two neighbors, rebalance on precision overflow — one scheme, chosen via ADR, unit-tested including the pathological rebalance.
- Estimate and status rollups for projects and cycles.
- Priority semantics including sort order (Urgent > High > Medium > Low > None).
- Filter spec type (the nested and/or structure the whole app will speak in Phases 4–5) + its zod schema, here so UI and API never invent their own.

## Repositories (`packages/db`)

- One repository per aggregate: typed CRUD + the specific read queries later phases need (list with filter/group/sort, rollups, counts).
- Row ↔ domain mappers: drizzle row types never leak past the package boundary.
- Integration tests run against pglite (fast, real Postgres semantics) in `verify:full`.

## Migrations & seed

- Drizzle-kit migrations, append-only after merge; `pnpm db:reset` = drop → migrate → seed.
- Seed is deterministic (fixed RNG and clock): 2 teams with distinct workflows, ~50 issues across states, 1 project with milestone, 2 cycles, comments and activities — enough to develop the UI against.

## Acceptance criteria

- `pnpm db:reset` on an empty Postgres succeeds twice in a row.
- Every invariant is unit-tested with counter-examples: state transitions, cycle rollover at a frozen clock (both policies), ordering rebalance, rollups.
- Repository integration suite green against pglite in `pnpm verify:full`.
- Boot check constructs schema + repositories.
- Schema↔migration drift gate: editing the schema without generating a migration fails `pnpm check` (regen-diff).

## Agent notes

This phase fixes vocabulary for everything after — naming here is load-bearing. Write an ADR for anything ambiguous, especially the ordering scheme and identifier allocation under concurrent inserts (sequence gap policy); resolve the ordering scheme via `/arena` — parallel sketches plus a judge on a different model family — before writing its ADR. No speculative seams: no generic EAV, no plugin systems, no fields "we might need."
