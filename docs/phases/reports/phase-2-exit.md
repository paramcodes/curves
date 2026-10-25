# Phase 2 — exit report (2026-10-24)

Adversarial review: **FAIL → fixed → PASS-by-fix-verification**. The review found 2 blockers and 4 should-fixes; every finding was verified independently by the fix agent before changing code, and all are closed with proofs (commits `d4bf9c0`, `794b133`, `4b7c16e`). Test totals at exit: **84 domain unit + 48 db integration + 49 api integration**, plus 11 api unit (registry/prod-guard).

## Acceptance criteria walk (docs/phases/02-api-auth.md)

| Criterion | Status | Evidence |
| --- | --- | --- |
| better-auth: signup/login/logout/password-reset; session in tRPC; UNAUTHORIZED for anonymous | **Partial** — signup/login/logout/session done and integration-tested; **password reset deferred to Phase 3** (needs the auth UI + an email transport decision — nothing to send mail with yet); anonymous → UNAUTHORIZED enforced by `protectedProcedure`, tested | `auth.integration.test.ts` (6 tests) |
| Routers for every resource + the one list procedure shape | **Met** — 12 routers, `listProcedure` shared by every listable resource; filter spec is the domain type end-to-end | `packages/api/src/list.ts`, `root.ts` |
| Validation & errors: zod at inputs, DomainError → TRPCError in one place, ERRORS.md | **Met** — zero direct `TRPCError` construction outside the guard + mapping table; table matches ERRORS.md row-for-row | `trpc/errors.ts`, `ERRORS.md` |
| Authz: single `assertCanAct` seam; reflection test — no mutation escapes | **Met after review FAIL** — the registry tag test alone was insufficient (reviewer reprodueced a views IDOR); fixed structurally: `mutation()` now *requires* an `authorize` gate (type-enforced, source-scanned, ordering-proven); views team-binding goes through `manage_views`; the review's exact IDOR repro is a permanent regression test | `trpc/trpc.ts`, `views.ts`, `part-b.integration.test.ts` |
| Cursor pagination, stability under concurrent inserts | **Met** — keyset cursors; stability proven at the repo contract (a row sorting before the cursor lands mid-walk); pglite single-connection means "concurrent" is interleaved — accepted interpretation, revisit on real Postgres | `contracts/issue-repo.contract.ts` |
| Contract snapshots → superseded by type-graph reasoning (ADR 0002) | **Met, with a fix the review earned** — the canary (`apps/web/src/api-contract-probe.ts`) was silently defused by turbo caching locally; `turbo.json` inputs now include cross-package sources; the flip proof passes both ways without `--force` | `794b133` transcript in decisions.tsv |
| Query hygiene (N+1 guard) | **Met** — exactly 3 statements for one grouped list (page select + batched labels + group counts), asserted against the real pglite client; runs in `verify:full` | `issue-repo.integration.test.ts` |
| Boot check constructs the full appRouter | **Met** — 38 procedures, `health.check` driven through a real caller | `packages/api/src/boot-wiring.ts` |

## Review findings triage

- **B1 views IDOR — FIXED** (`d4bf9c0`): outsider create/update of team views → rejected; owner gate strictly before role gate (even an admin gets NOT_FOUND on a foreign view — both sides pinned).
- **B2 turbo cache defusing the canary — FIXED** (`794b133`): cross-package `inputs` on typecheck/test/test:integration; pre-fix and post-fix transcripts recorded.
- **S5 repo stamp bypass — FIXED** (`d4bf9c0`): `update({stateId})`/`move(toStateId)` without full lifecycle stamps throws; contract pins the refusal.
- **S2 dev-secret fallback — FIXED** (`4b7c16e`): production with unset `BETTER_AUTH_SECRET`/`BETTER_AUTH_URL` fails fast; 3 unit tests.
- **S3 phantom bite pointer — FIXED** (`4b7c16e`): real bite re-run, verbatim transcript at `phase-2-registry-bite.md`; superseding decisions row.
- **S4 knip entry-glob tradeoff — RECORDED**: ADR 0007 (dead-export detection disabled in globbed packages; compensating controls listed; revisit condition).
- **S1 coverage interpretation — RECORDED**: integration coverage is per-router (happy + validation + authz per router), not per-mutation; breadth stated honestly here rather than claimed.
- **Nits**: `order` input cast (validation happens at the repo → still BAD_REQUEST, layering note in code), `health.check` is the one deliberate `publicProcedure` (documented here as the exception), duplicate-email enumeration accepted for v1 (revisit Phase 7), same-ms activity ordering compared as multisets.

## Phase exit records

- `pnpm verify:full`: exit 0 — **~27 s warm / ~2 min cold** after the turbo inputs change (the inputs make caches honest; cross-package changes now correctly re-run dependents).
- Reconciliation: this report, ADR 0007, registry-bite artifact, AGENTS.md status flip, decisions.tsv rows for every slice + the concurrency lesson + the review-fix wave.
- Slices: deferred repos (`c746d8c`), pglite speedup (`0634d2c`), better-auth (`f1bfb47`), tRPC foundation (`23d017f`), issues routers (`b61a1f7`), remaining routers + flags (`e73729d`, `cdae0bd`), acceptance hardening (`af89248`..`4608fb6`), review fixes (`d4bf9c0`, `794b133`, `4b7c16e`).
- Open for Phase 3: password reset (with the auth UI), invites/members management (teams create self-membership covers the creator only), real-Postgres cursor/concurrency re-verification when the dev DB lands.
