# Phase 3 — App Shell, Design System & Keyboard Infrastructure

Goal: the Linear-feel shell in a real browser: dark, dense, fast — sidebar, routing, command palette, global keyboard layer, working login. No issue features yet.

## Scope

- **In:** design tokens + base components, app layout, auth pages + protected routes, keyboard framework (including chords), cmdk palette for navigation, Vitest browser-mode harness (Lightpanda-first), agent-browser wired into the dev loop, visual snapshot baseline.
- **Out:** issue list/detail; anything beyond read-only seeded team data.

## Tasks

1. **Design system** (`packages/ui`): Linear-derived tokens as CSS variables — background elevations, text hierarchy, indigo accent, radii, shadows, a density scale; shadcn primitives re-themed; core components: Button, Input, DropdownMenu, Dialog, Tooltip, Avatar, Badge, Icon set (lucide). Components consume CSS vars, never raw hex.
2. **Layout**: sidebar (workspace switcher, teams with their states, views placeholder, roadmap placeholder, settings) + content slot; no top chrome — Linear style; collapsible sidebar.
3. **Routing** (App Router): `/inbox`, `/team/[key]`, `/projects`, `/views`, `/my-issues`, `/roadmap`, `/settings/*`, `/auth/*`; middleware session check and redirect rules.
4. **Auth UI**: login/signup/reset pages wired to Phase 2; protected layout.
5. **Keyboard layer**: a global shortcut registry with chord support (`g t`, `g p`, `g b`), scoping rules (global vs list vs input), `?` cheat-sheet dialog, strict focus-visible discipline. This is infrastructure with unit tests — later phases only register bindings.
6. **Command palette** (cmdk): `cmd+K` opens anywhere; navigate to teams/views/pages, theme toggle, placeholder create-issue action; recent items; fuzzy match.
7. **Browser test harness** ([ADR 0003](../adr/0003-browser-testing.md)): Vitest browser mode over CDP — the same runner and assertion API as unit/integration, with native screenshot assertions. Default engine **Lightpanda**; suites that hit engine gaps pin headless Chrome-for-Testing per-suite. First smoke suite: login → shell renders → palette opens → chord navigation; visual baseline of shell states (light + dark); axe scans for critical violations on core pages. The harness lands behind a validation gate: Lightpanda must render the app shell — anything failing pins Chromium and is tracked for revisit (SSE/WebSocket support is still maturing upstream).
8. **agent-browser dev loop**: install [agent-browser](https://agent-browser.dev) and wire it into root `AGENTS.md` — the "runtime surface observed" rule is executed with its accessibility snapshots and annotated screenshots against the dev server. This is the agents' verification tool, not a CI test framework (ADR 0003).
9. **Project verification skill + gardening**: regenerate `.agents/skills/verify-curves/` via `/create-verification-skill` against the real app — launch, doctor, drive with real selectors through agent-browser, evidence capture, cleanup — executed end-to-end once as part of generation; maintain it via `/maintain-verification-skill` at every later phase exit (verification instructions drift). This is also where the recurring gardening pass begins (PLAN.md working agreements): after each phase, agents scan for dead code and banned patterns and queue small PRs for batch human triage.

## Acceptance criteria

- Browser smoke suite green in CI (Lightpanda engine): a keyboard-only user can log in and reach every top-level route without touching the mouse.
- Engine report recorded at `docs/phases/reports/phase-3-engine-report.md`: which suites run on Lightpanda, which pin Chromium, and why.
- agent-browser is the documented way agents verify UI changes before declaring done.
- `.agents/skills/verify-curves/` regenerated for the real app and executed once, with evidence.
- The phase-end `/interrogate` review ran on the diff and its findings are triaged.
- Palette: opens anywhere, fuzzy finds, esc closes, arrows navigate, enter acts.
- Visual baseline captured and diff-gated in CI.
- Lighthouse accessibility ≥ 95 on shell pages.
- Initial JS budget for the shell is set here and enforced in CI from Phase 4 onward.

## Agent notes

The clone reads "Linear" from typography and density before any feature lands — tight spacing, 13–14px UI text, restrained elevation. Match it in the tokens once, and every later phase inherits it. Screenshots are part of done (runtime-surface rule): a passing DOM assertion on a page a human can't read doesn't count.
