# Phase-2 registry bite — raw `.mutation(` is unshippable (S3)

**Date:** 2026-10-25 · **Run by:** phase-2 review-fix slice · **Runner:** `pnpm --filter @curves/api run test -- src/routers/registry.test.ts` (vitest 5.0.5, unit tier)

## Why this file exists

The slice-5a decisions.tsv row claimed the mutation-registry test was "bite proven on raw `.mutation()`" without an artifact — a phantom evidence pointer the phase-2 review flagged (S3). This is the real capture.

**Bite injected** (then reverted) into `packages/api/src/routers/health.ts` — the only router with no mutations, so nothing else could interfere:

```ts
// BITE (reverted after capture): a raw .mutation( builder call — untagged,
// undeclared, and source-scanned.
bite: publicProcedure.mutation(() => ({ ok: true as const })),
```

**Result: `Tests 3 failed | 4 passed (7)` — exit 1.** Three independent guards fired on one line of code.

## Verbatim transcript

```text
 RUN  v5.0.5 /home/param/Projects/curves/packages/api

 ❯ src/routers/registry.test.ts (7 tests | 3 failed) 108ms
   ❯ mutation registry (7)
     × every procedure in appRouter is a query or a tagged mutation 42ms
     ✓ every tagged mutation is declared in its router's mutations list, and every declared key exists 5ms
     ✓ every router mounted in appRouter is covered by the mount table above 2ms
     × every router's exported mutations list matches its own procedure record 5ms
     ✓ mutation({input, authorize, resolve}) runs authorize BEFORE resolve, inside the procedure (structural proof) 21ms
     ✓ mutation() tags the procedure; a raw builder call stays untagged (mechanism proof) 3ms
     × no router source calls the raw .mutation( builder — mutation({...}) is the only shape (strike-2 scan) 18ms

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯ Failed Tests 3 ⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/routers/registry.test.ts > mutation registry > every procedure in appRouter is a query or a tagged mutation
AssertionError: expected [ Array(1) ] to deeply equal []

- Expected
+ Received

- []
+ [
+   "\"health.bite\" is an UNTAGGED mutation — build it with mutation() from trpc.ts",
+ ]

 ❯ src/routers/registry.test.ts:108:24
    106|       );
    107|     }
    108|     expect(violations).toEqual([]);
    |                      ^

 FAIL  src/routers/registry.test.ts > mutation registry > every router's exported mutations list matches its own procedure record
AssertionError: expected [ Array(1) ] to deeply equal []

- Expected
+ Received

- []
+ [
+   "health: exported mutations [] ≠ procedures [bite]",
+ ]

 ❯ src/routers/registry.test.ts:172:22

 FAIL  src/routers/registry.test.ts > mutation registry > no router source calls the raw .mutation( builder — mutation({...}) is the only shape (strike-2 scan)
AssertionError: expected [ 'health.ts' ] to deeply equal []

- Expected
+ Received

- []
+ [
+   "health.ts",
+ ]

 ❯ src/routers/registry.test.ts:242:23

 Test Files  1 failed (1)
      Tests  3 failed | 4 passed (7)
```

## What the three layers prove

| Guard | What it catches that the others miss |
|---|---|
| Tag walker (`_def.procedures` reflection) | A mutation assembled by ANY means and mounted in `appRouter` without the `mutation()` tag — including shapes a future refactor might invent. |
| `mutations`-list cross-check | A tagged mutation someone declared differently, or a raw one that slipped past the walker (defense in depth, and the router's public mutation contract). |
| Source scan (strike-2, this slice) | The raw builder call itself, at the source level — the file cannot even carry the text `.mutation(` outside a `*.test.ts`, so the bite fails before a router is ever mounted. |

The bite was reverted immediately after capture; `health.ts` is back to its query-only form and the suite is green (8/8 api unit tests, this file included).
