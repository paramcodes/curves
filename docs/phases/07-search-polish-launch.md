# Phase 7 — Search, Polish, Performance & Launch

Goal: find anything in two keystrokes, meet Linear-grade perf budgets, harden, deploy, and leave runbooks behind.

## Scope

- **In:** full-text search, deep command palette, performance budgets in CI, accessibility/keyboard parity pass, security hardening, deployment + runbooks.
- **Out:** everything in the v1 non-goals list (integrations, AI, native apps, public API).

## Tasks

1. **Search**: Postgres tsvector over issues/projects/comments; search results page grouped by type; palette integration (recent issues first, then full results); `cmd+K` is the front door to everything.
2. **Palette depth**: every entity type reachable; contextual actions (set priority, move to project, copy link); recent + suggested sections.
3. **Performance**: code-splitting audit, virtualization audit, font/icon strategy, prefetch on intent; lighthouse-ci budgets enforced in CI (performance ≥ 90 on shell, list with the 10k seed, and detail; JS size caps per route — Lighthouse itself needs real Chromium, independent of the browser-test engine); any optimization must cite a measurement showing the breach — nothing within budget gets touched.
4. **Accessibility & keyboard parity**: audit against Linear's published shortcut sheet; axe scan on all routes; focus-trap audit on dialogs; keyboard-only walkthrough of every core flow.
5. **Hardening**: per-user/IP rate limiting, input size caps, auth cookie flags + CSRF posture, `pnpm audit` + lockfile lint in CI, error boundaries + a real 500 page, structured logs with request IDs; Sentry optional.
6. **Ops**: deploy (Vercel + Neon defaults), expand-contract migration runbook, backup/restore runbook, post-deploy prod smoke (e2e against the prod URL), status page stub.
7. **Stretch**: CSV import (Linear export format), CSV export.

## Acceptance criteria

- lighthouse-ci green in CI on shell, list (10k seed), and issue detail.
- Search: a seeded issue's title found from the palette within two keystrokes; local query under 300 ms.
- The full e2e suite passes 3 consecutive runs. Flaky-test rule: quarantine + fix within the phase; silent retries are forbidden.
- Post-deploy prod smoke green; both runbooks dry-run executed and corrected where they lied.
- A short perf report exists at `docs/perf/REPORT.md`: budgets vs actuals, methodology, and what was deliberately left alone.

## Agent notes

Perf work here is budget-driven, not vibes — measurements first, and restraint is a deliverable. Launch is a human checkpoint: deployment credentials and DNS are strictly ask-first territory (see autonomy boundaries in `PLAN.md`).
