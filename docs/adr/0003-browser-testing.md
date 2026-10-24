# ADR 0003 — Browser testing without Playwright Test: Vitest browser mode + Lightpanda + agent-browser

**Status:** accepted — 2026-10-24, during planning.

## Context

The plan used Playwright Test for e2e, visual snapshots, and CI browser work. It works, but it is the heaviest item in the test stack: a second framework, a second assertion API, and full Chromium downloads. Re-evaluated October 2026 against lighter alternatives.

Research findings:

- **[agent-browser](https://agent-browser.dev)** ([vercel-labs](https://github.com/vercel-labs/agent-browser)): Rust CLI + daemon speaking **raw CDP — not Playwright underneath**. Accessibility-tree snapshots with element refs (`@e1`), annotated screenshots, ~90% less token usage than Playwright-MCP-style flows, 50+ commands, 44k+ stars, Apache-2.0. It is a tool for *agents driving a browser*, **not a test framework** — no CI assertions, and its `networkidle` wait hangs on SSE/WebSocket pages (use event-driven waits). Notably supports `--engine lightpanda`.
- **[Lightpanda](https://lightpanda.io)** ([lightpanda-io/browser](https://github.com/lightpanda-io/browser)): headless browser written from scratch (Zig, V8 JavaScript engine — not a Chromium fork), CDP-compatible: Playwright/Puppeteer connect to `lightpanda serve` as a drop-in endpoint. Tiny memory footprint, fast startup — ideal CI engine. **Gaps that matter to us**: in-page WebSocket connections are broken ([#1952, Mar 2026](https://github.com/lightpanda-io/browser/issues/1952)); SSE/EventSource support is unverified; rendering is not pixel-Chromium, so visual baselines are per-engine.
- **Vitest browser mode**: runs specs in real browsers over CDP with native screenshot assertions — meaning our existing unit/integration runner covers the browser tier too: one framework, one config style, one assertion API across the whole pyramid.
- Lighthouse (Phase 7) requires real Chromium regardless of the browser-test engine.

## Decision

Playwright Test is removed. Three roles, three right-sized tools:

1. **Agent self-verification (dev loop)** — **agent-browser**. The "runtime surface observed" rule in the definition of done is executed via agent-browser accessibility snapshots and annotated screenshots against the dev server. Token-efficient, no framework overhead, wired into root `AGENTS.md` in Phase 3.
2. **CI browser tests** — **Vitest browser mode over CDP**, default engine **Lightpanda**, with per-suite override to headless Chrome-for-Testing where Lightpanda's engine falls short (initially: anything realtime). Visual baseline = Vitest's native screenshot assertions, engine-pinned per suite. A Phase 3 validation gate records which suites run on which engine (`phase-3-engine-report.md`) and is revisited as Lightpanda matures.
3. **Two-session realtime check (Phase 6)** — a small standalone CDP script, no framework, running Chromium (two pages, one assertion script) until Lightpanda verifies SSE upstream.

Honest note: `playwright-core` may still appear as Vitest browser mode's driver library. What we dropped is the Playwright *test framework*, its runner, and its ecosystem weight — not a CDP driver library that Vitest uses internally.

## Consequences

- One runner (Vitest) for the entire pyramid; Lightpanda for most CI suites → less memory, faster CI boot, smaller caches.
- Engine risk is contained: per-suite override means a Lightpanda gap pins that one suite to Chromium — a config change, never a rewrite. If Lightpanda stalls entirely, every suite still runs through the same Vitest configs on Chromium.
- Visual diffs are only comparable within one engine; baselines record their engine.
- agent-browser's SSE/WebSocket wait caveat is documented: agents use event-driven waits (`--if-changed`, snapshot polling), never `networkidle`, on realtime pages.
