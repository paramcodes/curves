# Phase 5 — Projects, Cycles, Views & Team Workflow

Goal: the organizational layer above issues — projects with progress, cycles with rollover, saved views with a real filter builder, custom team workflows, roadmap.

## Scope

- **In:** workflow editor, projects + roadmap, cycles + rollover job, saved views (personal + team), My Issues, Triage.
- **Out:** comments/notifications on projects (Phase 6), import/export (Phase 7).

## Tasks

1. **Team workflow editor** (settings): custom states per team, category assignment, reorder, defaults; deleting a state requires its issues to be moved first (guard, not hope).
2. **Projects**: project page with grouped issue list (by status/milestone), progress (issues done/total + estimate rollup from Phase 1), health status, target date, lead; project updates (markdown posts) as stretch.
3. **Roadmap**: timeline with projects as bars and milestones as diamonds, quarter grid, today marker; keyboard-scrollable.
4. **Cycles**: schedule config (auto-create upcoming cycles), cycle view (scoped issues, completion chart, scope-creep indicator), manual add/remove of issues, rollover setting (incomplete → next cycle | backlog) executed by the Phase 1 policy as an idempotent scheduled job — a crash mid-rollover must converge on rerun.
5. **Views**: filter-builder UI (Linear-style nested and/or groups) that edits the Phase 1 filter spec JSON — the builder is an editor for that type, nothing more; save personal/team views, set a team default view; display options (grouping/sorting/columns) persisted per view.
6. **My Issues** (assigned/created/subscribed tabs) and **Triage** view (no assignee / no priority / backlog-state by team).

## Acceptance criteria

- E2E: create project → add issues from two teams → progress and roadmap update without reload.
- Cycle rollover: integration test with a frozen clock crossing cycle end asserts the configured policy (both variants); scope-creep stat correct when an issue is added mid-cycle.
- Saved views: create, share to team, teammate sees it; team default view applies on team page load.
- Workflow editor: a renamed/reordered state reflects instantly in Phase 4 lists — one state machine, one source of truth.
- Rollover job is re-runnable: running it twice yields identical data (idempotency test).

## Agent notes

Rollover is the first scheduled job in the system — design it idempotent from the start. The filter builder must never invent its own query semantics: it edits the domain filter spec; the API executes it. If a component needs to know "what filters match," that's a domain function.
