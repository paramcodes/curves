# Curves — a Linear clone, built agent-first

Working name **Curves** (rename freely). Goal: a self-hostable, keyboard-first issue tracker with Linear's core loop — issues, teams, cycles, projects, views — and Linear-grade snappiness, in a codebase an AI agent can navigate and extend without hand-holding.

This document is the master plan. It is a table of contents, not an encyclopedia: each phase has its own doc under `docs/phases/` with scope, tasks, and verifiable acceptance criteria.

**Status: planning complete, no code yet.** Start at [docs/phases/00-foundation.md](docs/phases/00-foundation.md).

## The two goals, and how they reinforce each other

1. **Product**: a Linear clone — the core loop (create an issue in two seconds, triage with the keyboard, organize with projects/cycles/views) at Linear's speed and density.
2. **Codebase**: agent-friendly by construction — strict types, deterministic guardrails, deep modules at clean seams, inferred/generated contracts, and a verification ladder an agent can run without asking questions.

Agents follow the path of least resistance more aggressively than humans, so this plan shapes that path instead of fighting it: every rule that matters is enforced by a tool with an exit code, not by prose. Prose (`AGENTS.md`) only points at the enforcement.

## Non-goals (v1)

Native/mobile apps, integrations marketplace, AI features, email digests, public API platform, SSO/SCIM, multi-region. Import/export limited to a CSV stretch goal in Phase 7.

## Stack (opinionated defaults — change via ADR, never silently)

| Concern | Choice | Why this is agent-friendly |
| --- | --- | --- |
| Monorepo | pnpm workspaces + Turborepo | canonical scripts per package, incremental verify |
| Language | TypeScript, strictest flags | compile errors are the cheapest feedback loop |
| Web | Next.js (App Router) + React | conventions agents already know; RSC + file routing |
| API | tRPC v11 + zod | end-to-end inferred types — contract drift is impossible by construction |
| DB | PostgreSQL + Drizzle ORM | SQL-first append-only migrations, TS-native schema types |
| Auth | better-auth (email + password, sessions) | fits workspace/team model, minimal config surface |
| Styling | Tailwind + shadcn/ui, custom Linear-derived tokens | deterministic primitives; theme = CSS vars, one contract |
| Server state | tRPC/TanStack Query cache + optimistic updates | one source of truth for server data |
| Ephemeral UI state | Zustand | tiny, testable, no ceremony |
| Large lists | TanStack Virtual | Linear is its lists; virtualization from day one |
| Realtime | Postgres LISTEN/NOTIFY → SSE | simplest correct thing; WS swap later behind one seam |
| Search | Postgres tsvector | no extra infra at v1 scale |
| Tests | Vitest everywhere — node (unit), pglite (integration), browser mode over CDP (e2e, Lightpanda-first); [agent-browser](https://agent-browser.dev) for agent self-verification | one runner, one assertion API for the whole pyramid; Lightpanda keeps CI light — see [ADR 0003](docs/adr/0003-browser-testing.md) |
| Lint & format | Biome (single Rust binary) | one tool, one JSON config: lint, format, import organizing — no ESLint/Prettier split, orders of magnitude faster |
| Guardrails | Biome boundaries + `noImportCycles`, knip, GitHub Actions; fast Biome-only pre-commit hook | few guards, each earning its place — types and tests carry correctness; see [ADR 0001](docs/adr/0001-biome-toolchain.md) and [ADR 0002](docs/adr/0002-lean-guardrails.md) |
| Deploy | Vercel + Neon (defaults) | swappable; nothing in app code may depend on the vendor |

## Repository layout

```
apps/web           Next.js UI — rendering and interaction only, no business logic
packages/api       tRPC routers: validation, authz, composition
packages/domain    pure domain logic: types, invariants, state machines — no I/O
packages/db        Drizzle schema, migrations, repositories (row ↔ domain mappers)
packages/ui        design system + shared components
packages/config    shared tsconfig / biome / tooling presets
docs/phases/       this plan, one doc per phase
docs/adr/          architecture decision records (created in Phase 0)
```

Dependency direction (enforced by Biome — nested per-package configs with `noRestrictedImports` + multi-file `noImportCycles`; violation messages include why + how to fix):

```
web → ui, api (type-only client import)
api → domain, db
db  → domain
domain → ∅        ui → ∅        no cycles, ever
```

## Verification ladder

| Command | Runs | When |
| --- | --- | --- |
| `pnpm check` | typecheck + `biome check` (lint & format) + knip | every edit |
| `pnpm verify` | check + unit tests | before every commit |
| `pnpm verify:full` | verify + integration (pglite) + boot check + e2e | PR / end of phase |
| `pnpm test:file <path>` | one test file | tight inner loop |
| `pnpm db:reset` | drop → migrate → deterministic seed | local development |

A guard is trusted only after it has been seen failing: every new guard ships with a one-time demonstration of the failure it catches, in its introducing PR. No permanent proof harness.

## Phases

| # | Doc | Phase ends when… |
| --- | --- | --- |
| 0 | [Foundation & agent harness](docs/phases/00-foundation.md) | fresh clone passes `pnpm verify` blind; guardrails proven to fail |
| 1 | [Domain model & data layer](docs/phases/01-domain-data.md) | whole data model exists; every invariant unit-tested |
| 2 | [API & auth](docs/phases/02-api-auth.md) | full typed API contract-tested; auth works |
| 3 | [App shell & design system](docs/phases/03-app-shell.md) | keyboard-first shell + command palette in a real browser |
| 4 | [Issues core loop](docs/phases/04-issues-core.md) | create → triage → edit → reorder at Linear speed, e2e-proven |
| 5 | [Projects, cycles, views, workflows](docs/phases/05-projects-cycles-views.md) | organizational layer complete |
| 6 | [Collaboration & realtime](docs/phases/06-collaboration-realtime.md) | two sessions see each other live |
| 7 | [Search, polish, perf, launch](docs/phases/07-search-polish-launch.md) | budgeted, hardened, deployed, runbooked |

No phase starts before the previous phase's acceptance criteria pass. Each phase is independently demoable. Every phase exit records three things: the acceptance-criteria results, the `pnpm verify:full` wall-clock (verification speed is the bottleneck metric — if it exceeds a few minutes, shrinking it becomes a task), and a reconciliation pass over that phase's doc and ADRs against what was actually built.

## Global rules (all enforced by a tool, none by prose alone)

- TypeScript strictest; no `any`, no double-casts; branded IDs (`IssueId`, `TeamId`, …) so a wrong-id never compiles.
- Zod parses at boundaries only (API input, env, external data); no defensive re-validation internally.
- Migrations are append-only; an applied migration is never edited.
- Never hand-write a type that codegen or inference owns (tRPC client types, Drizzle schema types).
- Every domain error is a typed class; HTTP/JSON mapping happens in exactly one place.
- Bounded per-function complexity (Biome, default thresholds); unused exports/deps fail CI (knip). Guardrails stay few — a proposal for a new one must demonstrate the failure it catches (ADR 0002).
- New behavior lands with: a unit test for the logic, a contract/integration test for the surface, and one runtime-surface observation (real browser / real DB) before it is called done.

## Definition of done (any slice, any phase)

1. `pnpm verify` green; `pnpm verify:full` green at phase end.
2. The touched surface observed running — browser for UI, real (pglite/Postgres) DB for queries. Tests passing alone is not done.
3. Docs touched if the surface moved (phase doc checklist or `AGENTS.md` pointer).
4. No suppressions added, no thresholds weakened; pre-existing failures recorded, never hidden.
5. A test that would still pass if the behavior were wrong is not verification — completion needs an observable result, and more tests do not mean more confidence.

## Working agreements for agents

- Read `AGENTS.md` → the current phase doc → the nearest package `AGENTS.md` before editing.
- Work in the smallest coherent slice; conventional commits (`feat(api): …`, `chore(guardrails): …`).
- Never edit: applied migrations, CI thresholds.
- A decision this plan doesn't cover → write a short ADR in `docs/adr/` and proceed; don't guess silently and don't stall.
- Stop and ask a human only for: credentials/secrets, production or destructive operations, or breaking a previous phase's contract. Everything else: proceed and record.
- Trust ladder: a new task class starts small and verifiable; delegation size grows only after the previous slices passed `pnpm verify:full` and the runtime-surface check without human repair.
- Design uncertainty resolves in code — a spike, a switchable prototype, or parallel sketches judged by a different model family (`/arena`) — never another planning doc.
- Bug fixes land test-first when a cheap local test exists (`/tdd`), with a regression test that failed before the fix.
- From Phase 3, a recurring gardening pass: agents scan for dead code and banned patterns and queue small PRs; the human triages in batches. Every weed pulled becomes a rule (`/correct` or an ADR) so it cannot grow back.

## Agent tooling (pstack — adopted in [ADR 0004](docs/adr/0004-agent-tooling-pstack.md))

The pstack skills (installed globally) are used deliberately, not by default:

- **`/interrogate`** — the phase-end gate: models from a different family attack the diff before acceptance criteria are signed off.
- **`/tdd`** — bug fixes, test-first where a cheap local test exists.
- **`/architect` with checkpoint** — cross-boundary slices settle types and module shape before implementation (Phase 4's optimistic list-store seam is the first).
- **`/arena`** — design decisions with real alternatives get parallel sketches plus a judge on a different model family (Phase 1's ordering scheme is the first).
- **`/correct`** — recurring repo mistakes become skill edits, never new guardrails.
- **Verification skill** — `.agents/skills/verify-curves/`, project-local; regenerated for the real app in Phase 3 via `/create-verification-skill`, maintained at every phase exit via `/maintain-verification-skill` (verification instructions drift too).
- **Decision log** — `decisions.tsv` at the repo root, append-only, one row per durable decision (show-me-your-work format).

Deferred until the verification harness exists and trust is earned: whole-phase `/poteto-mode` runs, `/swarm`, overnight loops, verifier auto-merge. Skipped outright: pstack planning playbooks (PLAN.md is the plan of record), Cursor-only benny automations, formal verification (revisit at Phase 5–6 for rollover idempotency and SSE resync — `/statechart` is the likely entry point).
## Key risks

| Risk | Mitigation |
| --- | --- |
| Scope explosion (Linear is enormous) | fixed non-goals; phase gating; each phase doc lists explicit out-of-scope |
| "Slow Linear" (clone that misses the point) | perf budgets enforced in CI from Phase 4 (10k-issue list) and Phase 7 (lighthouse) |
| Realtime complexity creep | SSE first; exactly-once machinery forbidden; WS only if SSE measurably fails |
| Agent-generated drift | inferred contracts (tRPC), append-only migrations, tsc across packages |
| Over-guarding: false positives and slow gates teach agents to bypass them | lean guardrail set (ADR 0002); pre-commit stays fast and Biome-only; CI is the only comprehensive gate |
| Optimistic-update bugs | one optimistic seam shared by e2e + unit tests; conflict policy written down in Phase 4 |
