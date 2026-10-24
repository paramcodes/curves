# ADR 0001 — Biome as the lint / format / boundary toolchain

**Status:** accepted — 2026-10-24, during planning (no code exists yet). Amended the same day by [ADR 0002](0002-lean-guardrails.md): jscpd deferred, and the GritQL double-cast plugin, file-size guard script, and ratchet baselines were dropped.

## Context

The original plan used **ESLint** (flat config + boundaries plugin + `max-lines` + `complexity`), **Prettier**, and **dependency-cruiser**. The toolchain was re-evaluated in October 2026 for speed, footprint, and agent-friendliness.

Research findings (2026-10):

- Biome 2.x is a single Rust binary covering lint, formatting, import organizing, and assists, with nested per-package `biome.json` configs designed for monorepos ([v2 announcement](https://biomejs.dev/blog/biome-v2-0-beta), [big-projects guide](https://biomejs.dev/configuration/big-projects)).
- Multi-file analysis ships [`noImportCycles`](https://biomejs.dev/linter/rules/no-import-cycles/javascript), direct and indirect — this covers dependency-cruiser's cycle detection. Known behaviors: type-only cycles are also flagged ([#6799](https://github.com/biomejs/biome/issues/6799)) — stricter than required, accepted; shared types go in dedicated files. CLI/editor inconsistency reports exist ([#6569](https://github.com/biomejs/biome/issues/6569)) — CI is the source of truth.
- Monorepo boundary enforcement today = nested configs + [`noRestrictedImports`](https://www.biomejs.cn/en/linter/rules/no-restricted-imports) with custom messages; an Nx-style dedicated zone rule is still only a [proposal (#6245)](https://github.com/biomejs/biome/discussions/6245). This is sufficient for our 6-package layer rules — each restriction carries a why + fix message.
- [`noExcessiveCognitiveComplexity`](https://biomejs.dev/linter/rules/no-excessive-cognitive-complexity/javascript) (default 15) replaces ESLint's `complexity`.
- [GritQL plugins](https://biomejs.dev/linter/plugins) (`.grit` files) allow custom pattern rules — e.g., banning `as unknown as` double casts. The plugin system is experimental: no scope analysis, no dataflow ([community notes](https://github.com/aliou/biome-plugins)) — pattern bans only.
- **No `max-lines` rule yet** ([discussion #5557](https://github.com/biomejs/biome/discussions/5557)) → keep a tiny file-size guard script; swap to the native rule when it lands.
- No Next.js-specific lint rules (`next/core-web-vitals` parity lost) — accepted; runtime web vitals are covered by lighthouse-ci from Phase 3/7.
- [jscpd](https://github.com/kucherenko/jscpd) is actively maintained (v4.2 released 2026-10; a Rust v5 claiming 24–37× speedups is in progress) — keep.
- knip (dead code), lefthook (hooks), Turborepo (orchestration), pnpm, Vitest, pglite — evaluated; no faster or simpler successor for their jobs. Keep. (Playwright was also kept at this point; it was replaced the same day by [ADR 0003](0003-browser-testing.md).)

## Decision

- **Remove ESLint, Prettier, and dependency-cruiser. Biome is the single lint/format/boundary tool.**
- Formatting: Biome formatter for TS/JS/JSON/CSS; markdown is intentionally not format-gated.
- Layer rules: nested per-package `biome.json` + `noRestrictedImports` (why + fix messages per restriction).
- Cycles: `noImportCycles`. Complexity: `noExcessiveCognitiveComplexity` (15). Double casts: GritQL plugin. File size: `scripts/guards/file-size.mjs` until the native rule exists.
- knip, jscpd, lefthook, GitHub Actions stay as planned.

## Consequences

- One binary, one config language, one `biome check --write` fix loop — faster inner loop for agents, and lint/format can never disagree.
- Lost vs dependency-cruiser: dependency-graph visualization. Accepted; if ever needed, re-add it in report-only mode in the CI tier.
- Lost vs eslint-plugin-boundaries: glob zones; expressed as per-package restriction lists instead — fine at 6 packages, revisit if the monorepo grows significantly.
- Experimental-plugin risk is contained: GritQL only for greppable wrong patterns; semantic invariants remain tests or script guards with failure proofs.
