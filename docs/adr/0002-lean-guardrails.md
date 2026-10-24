# ADR 0002 — Lean guardrail set (and what we deliberately do NOT enforce)

**Status:** accepted — 2026-10-24, during planning. Amends [ADR 0001](0001-biome-toolchain.md).

## Context

The original plan followed the `agent-ready-project` skill, which stacks many guards: file-size limits, complexity thresholds, jscpd duplication detection, ratchet baselines, a permanent `guard:proof` harness, custom GritQL rules, per-package instruction-file stubs, and dual wiring of *every* guard into both pre-commit hooks and CI. On inspection much of it is duplicated, speculative, or designed for legacy code we don't have — and the skill's own anti-pattern list ("custom linters for rare edge cases", "enforcement over design") condemns parts of what it prescribes.

Research (October 2026):

- **Context files**: mixed evidence on effectiveness — auto-generated AGENTS.md files *reduce* agent task success (~3%), human-written ones improve it only marginally (~4%); the value is accurate commands plus non-inferable domain knowledge, and bloat measurably hurts ([philschmid.de](https://www.philschmid.de/writing-good-agents), [aihero.dev guide](https://www.aihero.dev/a-complete-guide-to-agents-md), [GitHub's analysis of 2,500+ repos](https://github.blog/ai-and-ml/github-copilot/how-to-write-a-great-agents-md-lessons-from-over-2500-repositories)).
- **Pre-commit hooks**: slow hooks get bypassed by humans and confuse agents; keep only fast lint/format on staged files and put every real gate in CI ([flaviocopes.com](https://flaviocopes.com/git-hooks), [deployhq](https://www.deployhq.com/git/ai-git-hooks), [GitHub community report of agents failing with hooks](https://github.com/orgs/community/discussions/167906)).
- **Stacked linters**: false-positive fatigue, configuration burden, diminishing returns — especially early, before conventions settle ([SE StackExchange: when NOT to use static analysis](https://softwareengineering.stackexchange.com/questions/437457/when-not-to-use-static-analysis-tools), [Qlty on linting DX gaps](https://qlty.sh/blog/developer-experience-gaps-of-linting-on-ci)).
- **Ratchets** exist to grandfather pre-existing violations; a greenfield repo whose CI fails from day one has nothing to ratchet.
- Correctness at our scale lives in **types and tests**, not in more linters.

## Decision

**Keep** — each earns its place on a greenfield repo:

1. TypeScript strictest settings — the highest signal-per-second guard.
2. Biome: layer boundaries (nested configs + `noRestrictedImports` with why+fix messages), `noImportCycles`, `noExplicitAny`, `noExcessiveCognitiveComplexity` at defaults.
3. knip in CI — dead code is the classic agent artifact.
4. Pre-commit = Biome on staged files only; CI is the single comprehensive gate.
5. Verification ladder + boot check + the test pyramid (unit / integration / e2e) — where correctness actually lives.
6. Small root `AGENTS.md` (commands, pointers, non-obvious facts); package `AGENTS.md` only with genuine local rules.

**Drop** — each with the failure that would justify revisiting:

- **jscpd** — duplication is visible in review at greenfield scale; revisit when duplication is actually observed in review or the codebase passes ~20k LOC.
- **File-size guard script** — proxy metric for readability; the cognitive-complexity rule stays. Revisit if unwieldy files become a review theme.
- **GritQL double-cast plugin** — rare pattern under strict TS, experimental plugin machinery; revisit if `as unknown as` appears in review.
- **Ratchet baselines** — nothing legacy to grandfather; revisit if mature code is ever imported.
- **Permanent `guard:proof` command + fixture suite** — replaced by the discipline: demonstrate a new guard failing once, in its introducing PR.
- **Per-package AGENTS.md stubs** — empty stubs are noise that degrades agent performance; files appear only with real content.
- **Phase 2 contract-snapshot hash machinery** — in a monorepo, tRPC's contract is the TypeScript type graph; a breaking change fails `tsc` across packages. Revisit only with an external HTTP API.
- **Dual hook+CI wiring for every guard** — hooks fast and minimal, CI comprehensive.

**Never adopted from the skill**: rule tables, auditors, projectors, marker/strike systems — deterministic CI on a six-package repo makes that machinery redundant.

## Consequences

- Fewer tools: faster inner loop, fewer false positives, less for agents to learn — and less to bypass.
- Some duplication or dead code may slip review until the deferred tools land; accepted at greenfield scale.
- The rejected list is load-bearing: re-adding anything requires new evidence of the failure it catches.
