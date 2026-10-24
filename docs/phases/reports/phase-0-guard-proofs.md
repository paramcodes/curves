# Phase 0 — guard proofs transcript (2026-10-24)

One-time demonstrations that each guard fails on a bad pattern, then restores green. Per ADR 0002 this is a discipline, not a permanent harness.

## 1. Layer boundary (`noRestrictedImports`, nested per-package biome.json)

Bad pattern: `packages/domain/src/bad-import.ts` containing `import "@curves/api";`

```
packages/domain/src/bad-import.ts:1:8 lint/style/noRestrictedImports ━━━━━━━━━━━━━━━

  × domain is the bottom layer — it must not import other @curves/* packages (PLAN.md dependency
    direction: domain → ∅). Invert the dependency: keep pure types and invariants here, move
    this logic to packages/db or packages/api.
```

Removed → `biome check .` green.

## 2. Explicit any (`suspicious/noExplicitAny`)

Bad pattern: `packages/db/src/bad-any.ts` containing `export const bad: any = 1;`

```
packages/db/src/bad-any.ts:1:19 lint/suspicious/noExplicitAny ━━━━━━━━━━━━━━━━━━━

  ! Unexpected any. Specify a different type.
```

Removed → green.

## 3. Import cycle (`suspicious/noImportCycles`, multi-file analysis)

Bad pattern: two files in `packages/api/src` importing each other.

```
packages/api/src/bad-a.ts:1:19 lint/suspicious/noImportCycles ━━━
  × This import is part of a cycle.
packages/api/src/bad-b.ts:1:19 lint/suspicious/noImportCycles ━━━
  × This import is part of a cycle.
```

Removed → green.

## 4. Boot check wiring (real, not theater)

With `packages/domain/src/entry.ts` temporarily moved away:

```
boot-check: FAIL — ../packages/domain/src/entry.ts failed to import:
Error [ERR_MODULE_NOT_FOUND]: Cannot find module '.../packages/domain/src/entry.ts'
```

Restored → `boot-check: OK (skeleton)`. Deleting any package entry genuinely fails the check.

## Incidents found during Phase 0

- **lefthook flag bug**: the guardrails slice initially used `biome check --no-errors-on-unmatched-files` — that flag does not exist in Biome v2.6, so the pre-commit hook errored on every commit. Caught by the first real commit through the hook; fixed (v2 handles unknown file types via `files.ignoreUnknown`). The hook then passed on the guardrails commit itself.
- **Exit-code masking in the proof harness (operator slip, not repo code)**: `node scripts/boot-check.mjs | tail -2; echo $?` printed tail's exit (0), not the check's. The FAIL output line is the real evidence above. Repo scripts avoid pipes or use pipefail; transcript kept honest per the evidence discipline.
- **Two of three subagents stalled after file work, before verify/commit** (harness concurrency errors surfaced as phantom spawn failures while work continued). Orchestrator finished their last mile and re-verified everything with real exit codes; nothing was merged unverified.

## Phase-0 verification summary

| Check | Result |
| --- | --- |
| `pnpm install --frozen-lockfile` | exit 0 |
| `pnpm exec turbo run typecheck` | exit 0 (5/5 packages) |
| `pnpm exec biome check .` | exit 0 |
| `pnpm exec knip` | exit 0 |
| `pnpm exec turbo run test` | exit 0 (4 packages × 1 test, zero-collection fails by config) |
| `node scripts/boot-check.mjs` | exit 0 |
| **`pnpm verify:full` (full ladder)** | **exit 0 — 5.9 s wall clock** |
| CI workflow | written, not yet exercised on GitHub (first push will tell) |

## Incident 2 (post-report): Biome "no files processed" on docs-only commits

A commit staging only unknown-type files (md/yaml/tsv) made `biome check {staged_files}` exit 1 with "No files were processed in the specified paths" — blocking docs commits. Fixed with a lefthook job-level `glob: "*.{ts,tsx,js,jsx,mjs,cjs,json,jsonc,css}"`: no matching staged files → the job is skipped. Verified both ways: code commits run the hook (0.9 s), docs-only commits skip it (0.00 s, commit succeeds). Note: the initial manual reproduction of this bug was misread as passing — `cmd | tail; echo $?` reports tail's exit code, the same masking trap recorded above.
