# ADR 0007 — knip entry globs for the contract-bearing packages

**Status:** accepted — 2026-10-25, during the phase-2 review-fix slice (should-fix S4).

## Context

knip's job in this repo (ADR 0002) is dead-code detection: exports nothing consumes should be loud. It works from *entry files* — everything reachable from an entry is "used"; exports not reachable from any entry are flagged.

Our packages do not have conventional entry points. CORE_MODEL (§ file-findability) bans barrels, and the packages are consumed through deep imports (`@curves/db/repos/issue.repo`, `@curves/domain/issues/state-machine`, `@curves/api/trpc/trpc`) plus subpath `exports` maps. Consumers fall into two classes knip cannot see as a graph edge by default:

1. **Cross-package deep imports** — api imports individual db repos; web imports api's `root.ts` type. Each is a real edge, but only for the specific file imported.
2. **Test and contract files** — the importable contract suites (`packages/db/src/contracts/*.ts`) are consumed *by integration tests only*, and seed/jobs modules are consumed by `db:reset` scripts and turbo tasks rather than by production code.

With per-file entries (`entry: ["src/entry.ts"]`) on such packages, knip flags huge amounts of live code — every repo factory exported for deep import, every contract, every schema table — producing a wall of false positives that trains everyone to ignore knip. With a single `src/**` glob, knip has nothing left to say at all.

Current config (`knip.json`): the root, `apps/web`, and `packages/ui` have precise entries (real entry points exist there); `packages/db`, `packages/domain`, and `packages/api` use glob-per-directory entries (`src/repos/*.ts`, `src/issues/*.ts`, `src/routers/*.ts`, …) — six workspaces in total.

## Decision

Keep the glob-per-directory entries for `packages/db`, `packages/domain`, and `packages/api`, and accept the consequence: **within those three packages, knip's unused-export detection is effectively disabled** — every exported symbol in a globbed directory counts as used. knip remains fully effective for `apps/web`, `packages/ui`, and the workspace root (unused dependencies, unresolved imports, and file-level dead code still report across all workspaces).

Compensating controls for what knip no longer sees, in the three packages, by layer:

- **api** — the registry test (`src/routers/registry.test.ts`) is a structural consumer of every router: mount coverage, mutation tagging, the `mutations`-list cross-check, and the source scan mean a router module that nothing imports (or a mutation built outside the helper) fails CI. Router exports cannot rot silently.
- **db** — the importable contract suites (`src/contracts/*.ts`) are behavioral specifications that consume every repo surface; a repo method nobody calls shows up as a contract gap in review, and the query-count guard pins the one N+1-sensitive path. The schema↔migration regen gate keeps schema exports honest.
- **domain** — pure functions with failing tests would surface in `pnpm verify`; the domain's surface is small, reviewed, and every module carries its own unit suite (84 tests).

Plus the catch-all: review gates (`/interrogate` at phase end, adversarial review) explicitly look for speculative exports, and `verify:full`'s boot check constructs the real object graph (`appRouter` = 38 procedures) so a disconnected module fails at boot wiring.

## Consequences

- knip output stays small and trusted: a knip finding is actionable, in the packages where entry points are real.
- Dead exports in db/domain/api will not be flagged automatically. The cost is bounded: exports there are few, contract-tested, and added one review at a time.
- The `knip.json` "Remove redundant entry pattern" hint that appears when a glob collapses to a single directory is cosmetic; it is safe to apply.

## Revisit

Narrow the entries per-feature as real consumers appear: when `apps/web` starts importing specific api routers (it already pins `@curves/api/root` type-only), or when a package gains a genuine barrel-free entry module, replace the globs covering that surface with precise entries. Re-visit trigger: any package's test/contract files becoming production-consumed (entries then become testable again), or knip gaining first-class monorepo deep-import tracing that makes the globs unnecessary.
