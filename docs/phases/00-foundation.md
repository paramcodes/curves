# Phase 0 — Foundation & Agent Harness

Goal: from empty directory to a repo where any agent (or human) can clone, run `pnpm verify`, and extend safely. No product code in this phase — everything here is the paved road that later phases drive on.

Why first: agent output quality is bounded by the guardrails that exist when the code is written. Tests and gates must exist before feature code scales.

## Scope

- **In:** monorepo scaffold, strict TypeScript, verification ladder, deterministic guardrails (pre-commit AND CI), `AGENTS.md` navigation layer, boot-check skeleton, CI, ADR folder.
- **Out:** product features, DB schema, UI, deployment.

## Tasks

1. **Scaffold** — pnpm workspaces + Turborepo; pin node (`.nvmrc`) and package manager (corepack); create empty packages `apps/web`, `packages/{api,domain,db,ui,config}` each with a public entry point.
2. **Strict TS base** (`packages/config`): `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride`, `noFallthroughCasesInSwitch`; shared Biome config preset that root and package configs extend — lint, format, and import organization in a single `biome check --write` pass. No ESLint, no Prettier (ADR 0001). Markdown is intentionally not format-gated.
3. **Verification ladder** in root `package.json`: `check` / `verify` / `verify:full` / `test:file`; Turborepo pipelines so each is incremental (unchanged packages skip).
4. **Guardrails** — deliberately few, each earning its place; the rejected list with reasons lives in [ADR 0002](../adr/0002-lean-guardrails.md):
   - **Biome**: nested `biome.json` per package enforcing the layer rules from `PLAN.md` via `noRestrictedImports`, each restriction carrying a why + fix message (`domain` and `ui` may not import any `@curves/*` package; `web` may not import `@curves/db` or `@curves/domain` directly — the api package re-exports what the UI needs; `api` is the only consumer of `@curves/db`); `noImportCycles`; `noExplicitAny`; `noExcessiveCognitiveComplexity` at default thresholds.
   - **knip** in CI only — dead code is the classic agent artifact.
   - **lefthook pre-commit = Biome on staged files only**, nothing else — fast enough that it is never worth bypassing. knip, typecheck, tests, and the boot check run in CI; slow hooks teach bypassing.
5. **Prove each guard fails once** — temporarily add a layer violation, an `any`, and a cyclic import; observe each failing `pnpm check`; revert. Record the transcript in `docs/phases/reports/phase-0-guard-proofs.md`. This is a one-time discipline (repeated per new guard, in its introducing PR) — not a permanent command or fixture suite.
6. **Boot check skeleton** — a script that imports each package's public entry and asserts the wiring constructs without serving traffic (real content arrives with Phases 1–2).
7. **Navigation layer** — small root `AGENTS.md` (commands, pointers, non-obvious facts only; research shows context-file bloat measurably hurts agent performance); package-level `AGENTS.md` only where a package has genuine local rules — create `packages/domain`'s now (purity rules), others when real content exists, never as empty stubs; `.env.example` (canonical env contract); `.editorconfig`; `.gitignore`.
8. **ADR folder** — `docs/adr/0000-record-architecture-decisions.md` (the ADR process itself); the first real decision, [0001 — Biome toolchain](../adr/0001-biome-toolchain.md), already exists from planning.
9. **CI** (GitHub Actions): install (cached) → `check` → `verify` → `verify:full`; artifacts (browser-test screenshots/diffs later); the CI runs the same canonical commands as local — no CI-only magic.
10. `git init` + one conventional commit per task slice.

## Deliverables

Repo skeleton, working ladder commands, guardrails with a failure-proof report, green CI on a draft PR, the `AGENTS.md` navigation layer.

## Acceptance criteria

- Fresh clone: `pnpm install && pnpm verify` exits 0 with no setup beyond node + pnpm.
- Every guard was demonstrated failing on a bad pattern once (transcript in the phase report).
- Boot check genuinely wires: deleting any single package's entry file fails it.
- CI is green and runs the canonical commands verbatim.
- An agent given only `AGENTS.md` can answer: "where would feature X live, and what command verifies it?"

## Agent notes

Full autonomy within this phase — no secrets, no external services. One decision goes to the human: CI provider and branch-protection settings (requires repo admin). Do not add guardrails without a failure proof; do not add a rule the linter already enforces (lint leakage). The rejected list in ADR 0002 is load-bearing: do not re-add jscpd, file-size limits, custom GritQL rules, or ratchet baselines without new evidence.

Accepted gaps, recorded in ADR 0001: no Next.js-specific lint rules (`next/core-web-vitals` parity — web vitals covered by lighthouse-ci in Phase 7 instead); `noImportCycles` has known CLI/editor inconsistencies — CI is the source of truth.
