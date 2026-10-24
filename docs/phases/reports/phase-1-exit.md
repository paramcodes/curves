# Phase 1 — exit report (2026-10-24)

Adversarial review: FAIL → fixed → PASS. Reviewer verdict artifact: the review found 1 blocker and 5 should-fixes; all were either fixed this session or are recorded below with a deferral reason. Evidence for every claim is a commit or a command output in this file's history.

## Acceptance criteria walk (docs/phases/01-domain-data.md)

| Criterion | Status | Evidence |
| --- | --- | --- |
| `pnpm db:reset` twice, identical output | **MET on the pglite-file target** — the "empty Postgres" reading is substituted (S3 below): the Postgres path exists behind `DATABASE_URL` with a prod-refusal guard but `pg` is not a dependency until the Phase 2 dev DB | two runs, byte-identical summary JSON (session transcript + seed integration test) |
| Every invariant unit-tested incl. counter-examples | MET | state machine (legal + illegal pairs, reopen, purity), rollover (both policies, exclusions, convergence), ordering (collision signal, 52-halving squeeze), rollups (canceled exclusion) — 84 domain tests |
| Repo integration suite green in `verify:full` | MET | 36 integration tests, 5 files (schema, issue-repo contract, supporting repos, rollover job, seed determinism) |
| Boot check constructs schema + repositories | MET | `packages/db/src/boot-wiring.ts` — real migrations + all 6 repos + rollover job + a query through a repo, run by `scripts/boot-check.mjs` |
| Schema↔migration drift gate | MET + proven biting | `pnpm regen:check` in `check`: real column drift produced `0001_*.sql` + journal diff and failed with the drift message listing the files; clean tree passes |

## Review findings and triage

**B1 (blocker) — FIXED (`be0055f`).** The SQL mirror of `evaluate()` coerced cross-typed but zod-valid values (`created eq "<ISO string>"`, `priority in ["3"]`) where the domain is strict — reproduced by the reviewer against pglite. Fix: `equalityToSql` guard (eq → false, neq → vacuous truth) + strict member filter in `membership`; the reviewer's two repros plus a scalar-`neq` pin and a null-member `nin` are now permanent `ORACLE_SPECS`. Contract suite 15/15 after fix.

**S2 — FIXED (`be0055f`).** Nested Biome configs only restricted package-specifier imports; a deep relative import (`../../../packages/db/...`) passed. All six configs now carry `**/packages/<pkg>/**` backup patterns; the reviewer's exact probe now fails `biome check` (verified, reverted).

**S1 — DEFERRED (recorded).** Five aggregates have no repo yet (label, project, milestone, view, notification) and `labels` lacks `unique(teamId, name)`; Phase 2 begins with these as its first slice. `DuplicateLabelError` folds into `DuplicateError` until then.

**S3 — DEFERRED (recorded).** Postgres `db:reset` path is written but unobserved (no `pg` dep, no database). First observed run happens in Phase 2 when the dev DB exists.

**S4 — RECORDED (ADR 0005 update).** Repo-side transactional rebalance application deferred to Phase 4; `move()` callers check `needsRebalance` in the meantime.

**S5 — RECORDED + shrink task.** Cold `verify:full` = 301 s (per-test pglite WASM+migrations dominate); warm (turbo cache) ≈ 5 s. The shrink task: share one migrated pglite instance across a file's tests (or a suite-wide pool) before Phase 2 doubles the suite. AGENTS.md updated to state cold/warm honestly.

**Nits recorded for gardening (not fixed):** N1 update() last-write-wins vs CORE_MODEL's "409 on stale updatedAt" — settle at Phase 4 optimistic layer; N2 keyset `sk` ms-truncation vs microsecond SQL timestamps; N3 knip entry-globs disable dead-export detection in db/domain (tighten as features consume); N4 `web` unit script still `--passWithNoTests` (real tests arrive Phase 3); N5 `regen:check` leaves untracked migration files after failing; N6 seed determinism oracle is byte-identical for issues but count-only for comments/activities; N7 dual membership representation (denormalized columns + join tables) — no invariant test yet, join tables unread; N8 `PRIORITY_SORT` named export absent (encoding is implicit); N11 `orderBetween` with swapped operands masquerades as a collision signal instead of throwing; N10 ADR-0006 retry test pins an id collision, not a number race (pglite is single-connection — honest proxy).

## Phase exit records

- `verify:full`: exit 0 — **301 s cold / ~5 s warm** (turbo-cached). Verification-speed metric recorded; shrink task above.
- Reconciliation: this report + ADR 0005 update + AGENTS.md status/commands + decisions.tsv rows for slices 9-10, review, and exit (the slice-8 row was logged during the session).
- Slices shipped this phase: core primitives (ed895d8), entities (91a04a7), state machine (0942628), filter vocabulary (efce29b), cycles/rollups (7e9d234), ordering (a90bd55), schema+pglite (48371da), issue repo+oracle (5974694), supporting repos+rollover job (978feea), seed+db:reset (05da93c), ladder hardening (e67bd92), review fixes (be0055f).
