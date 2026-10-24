# Phase 2 — API & Auth

Goal: a complete, contract-tested tRPC API over the domain, plus the auth/session lifecycle. After this phase the web app never touches the DB — only typed procedures.

## Scope

- **In:** better-auth, tRPC routers for every resource, zod validation, error mapping, minimal RBAC, cursor pagination, API integration tests.
- **Out:** any UI beyond a health page; invites/SSO (non-goal v1).

## Tasks

1. **Auth**: better-auth against the Phase 1 `users` table — signup, login, logout, password reset; session context injected into tRPC; an unauthenticated request to any non-auth procedure returns `UNAUTHORIZED`.
2. **Routers**: issues, teams, states, labels, projects, milestones, cycles, comments, views, notifications (read/mark), users/me, workspace. CRUD plus the list query (filter/group/sort/cursor) — the filter spec is the Phase 1 domain type, exposed through exactly one list procedure shape reused across entities.
3. **Validation & errors**: zod at procedure inputs only; domain errors → `TRPCError` mapped in one place; stable error codes documented in `packages/api/ERRORS.md`.
4. **Authz**: workspace member/admin and team-membership checks through a single `assertCanAct` helper; a reflection test proves every mutation router passes through it — adding a procedure without the guard fails the registry test.
5. **Pagination**: cursor-based; integration tests assert cursor stability under concurrent inserts.
6. **Query hygiene**: list endpoints execute a bounded number of SQL statements; an integration test asserts query counts (N+1 guard).

No contract-snapshot machinery: in a monorepo, tRPC's contract *is* the TypeScript type graph — a breaking change fails `tsc` across packages, which is precisely why tRPC was chosen. Revisit only if an external HTTP API ever exists ([ADR 0002](../adr/0002-lean-guardrails.md)).

## Acceptance criteria

- Integration suite (pglite + tRPC test caller) covers every mutation's happy path, validation failure, and authz failure — runs in `verify:full`.
- Reflection/registry test: no mutation escapes the authz helper.
- A deliberate contract change (flip one field type) fails typecheck in `apps/web` — demonstrated once, then reverted.
- Boot check constructs the full `appRouter`.
- `pnpm verify` stays fast — API integration tests live in `verify:full`, not the pre-commit tier.

## Agent notes

tRPC infers end-to-end types — never hand-write a client type. Procedures stay thin: validate → call domain/repository → map. Business logic appearing inside a router is a layer violation; the Biome boundary rule from Phase 0 flags it, and the fix is always "move it to `packages/domain`."
