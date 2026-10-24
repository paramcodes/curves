# Phase 4 — Issues: the Core Loop

Goal: the loop that makes Linear Linear — create an issue in two seconds, triage with the keyboard, edit with zero waits. List, detail, filters, optimistic everything.

## Scope

- **In:** virtualized issue list (grouped/sorted/filtered), issue detail (split pane + full page), create modal, inline edits, drag reorder, sub-issues, relations, bulk actions.
- **Out:** projects/cycles interactivity (read-only display is fine), comments and activity UI (Phase 6).

## Tasks

1. **List**: TanStack Virtual rows; grouping by status/assignee/priority/label/none; sorting (priority, updated, created, title); basic filter chips from the Phase 1 filter spec; group headers with counts.
2. **Detail**: split pane (list + detail) and `/issue/[key]` full page sharing the same components; markdown description editor with preview; properties panel (state, assignee, priority, labels, project read-only, estimate, dates); sub-issue tree; relation editor.
3. **Create**: `cmd+K` → `C` from anywhere; modal with quick-syntax fields (title, description, `@` assignee, `#` label, `!` priority, `+` project); `esc` cancels, `cmd+enter` saves; identifier allocated server-side.
4. **Optimistic layer**: create/update/reorder applied instantly, reconciled on response; conflict policy last-write-wins with a reload-on-409 escape hatch — written down in an ADR before implementation; failures roll back with a toast. One seam (a list store) shared by unit and e2e tests.
5. **Drag reorder** within and across groups, driven by the Phase 1 fractional-ordering domain logic; keyboard reorder (`shift+↑/↓`) as a first-class alternative.
6. **Bulk actions**: shift/cmd multi-select, bulk set state/priority/assignee, bulk archive/delete.
7. **Perf footing**: page size 50 + cursor; group counts server-side; a `--seed:big` flag producing a 10k-issue dataset.

## Acceptance criteria

- Browser tests: create → switch grouping → inline edit → drag reorder → bulk update, all keyboard-capable; the suite asserts optimistic semantics (edit applies with no pending/spinner flash).
- Perf budget test in CI against the 10k seed: first paint of the list within budget, no scroll jank over threshold, initial JS under the Phase 3 budget.
- Grouping/sorting/filter logic lives in `packages/domain` with unit tests; components only render.
- Every property change writes an `activities` row (verified now, surfaced in Phase 6).

## Agent notes

Optimistic code is where clones get slow — do not swap the state approach without an ADR. Settle the list-store seam first with `/architect` (checkpoint mode): types and module shape reviewed before any implementation lands. Keep the row component dumb; every interaction dispatches through the single list-store seam so unit, e2e, and the real UI share semantics. No server round-trip may gate a visual edit.
