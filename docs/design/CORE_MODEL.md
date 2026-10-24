# Curves — Core Model: types, modules, interfaces, file tree

Reference design for Phase 1 (domain + data) and Phase 2 (API). Code lands in `packages/domain` / `packages/db` / `packages/api`; this doc is the blueprint until then. TS snippets here are the contract — implementation may add, never loosen.

Rules encoded below: domain is pure (no I/O — no fetch, no db, no clock reads; time is injected); zod schemas live beside their types in domain, parsing happens at API input; IDs are branded; every feature folder exposes one deliberate public surface (`*.api.ts`) — no `index.ts` barrels; dependencies flow one way (web → ui, api ← domain, db).

## 1. Primitives (domain/src/core)

```ts
// brand.ts
export type Brand<T, B extends string> = T & { readonly __brand: B };

// ids.ts — every entity gets one; wrong-id comparisons do not compile
export type UserId        = Brand<string, "UserId">;
export type TeamId        = Brand<string, "TeamId">;
export type StateId       = Brand<string, "StateId">;
export type LabelId       = Brand<string, "LabelId">;
export type IssueId       = Brand<string, "IssueId">;
export type ProjectId     = Brand<string, "ProjectId">;
export type MilestoneId   = Brand<string, "MilestoneId">;
export type CycleId       = Brand<string, "CycleId">;
export type CommentId     = Brand<string, "CommentId">;
export type ActivityId    = Brand<string, "ActivityId">;
export type NotificationId= Brand<string, "NotificationId">;
export type ViewId        = Brand<string, "ViewId">;
// constructors used at boundaries: zod .transform / db mappers
export const issueId = (s: string) => s as IssueId; /* …one per type */

// errors.ts — no bare Error anywhere in domain
export abstract class DomainError extends Error {
  abstract readonly code: "not_found" | "invalid" | "transition_not_allowed"
    | "duplicate" | "conflict";
}
export class NotFoundError extends DomainError { readonly code = "not_found" as const; }
export class ValidationError extends DomainError { readonly code = "invalid" as const; }
export class TransitionNotAllowedError extends DomainError { readonly code = "transition_not_allowed" as const; }
export class DuplicateError extends DomainError { readonly code = "duplicate" as const; }
export class ConflictError extends DomainError { readonly code = "conflict" as const; } // → HTTP 409

// clock.ts / rng.ts — determinism helpers (frozen clock, seeded rng; tests + seed use these)
export interface Clock { now(): Date }
export const fixedClock = (at: Date | string): Clock => ({ now: () => new Date(at) });
```

## 2. Entities (domain/src/<feature>/<feature>.types.ts)

```ts
// teams/team.types.ts
export interface User  { id: UserId; name: string; email: string; avatarUrl: string | null }
export interface Team  { id: TeamId; key: string; name: string }        // key → "ENG"
export type TeamRole = "admin" | "member";
export interface TeamMember { teamId: TeamId; userId: UserId; role: TeamRole }

// teams/workflow.types.ts — per-team states; category drives semantics everywhere
export type StateCategory = "backlog" | "unstarted" | "started" | "completed" | "canceled";
export interface WorkflowState { id: StateId; teamId: TeamId; name: string;
                                 category: StateCategory; position: number }
export interface Label { id: LabelId; teamId: TeamId; name: string; color: string }

// issues/issue.types.ts
export type Priority = 0 | 1 | 2 | 3 | 4;   // none, low, medium, high, urgent
export type OrderKey = Brand<string, "OrderKey">;  // fractional ordering — scheme fixed by ADR
export interface Issue {
  id: IssueId; teamId: TeamId; number: number;      // per-team sequence
  title: string; description: string;               // markdown
  stateId: StateId; priority: Priority; estimate: number | null;
  assigneeId: UserId | null; creatorId: UserId;
  parentId: IssueId | null;                          // sub-issues
  labelIds: LabelId[]; order: OrderKey;
  projectId: ProjectId | null; milestoneId: MilestoneId | null; cycleId: CycleId | null;
  createdAt: Date; updatedAt: Date;
  startedAt: Date | null; completedAt: Date | null; canceledAt: Date | null; archivedAt: Date | null;
}
export type RelationType = "blocks" | "blocked_by" | "related";
export interface IssueRelation { issueId: IssueId; relatedIssueId: IssueId; type: RelationType }
export const issueIdentifier = (teamKey: string, n: number) => `${teamKey}-${n}`; // "ENG-101"

// projects/project.types.ts
export type ProjectStatus = "planned" | "in_progress" | "paused" | "completed" | "canceled";
export type ProjectHealth = "on_track" | "at_risk" | "off_track";
export interface Project { id: ProjectId; name: string; description: string;
  status: ProjectStatus; health: ProjectHealth | null;
  leadId: UserId | null; targetDate: Date | null; createdAt: Date }
export interface ProjectMilestone { id: MilestoneId; projectId: ProjectId;
  name: string; targetDate: Date | null; position: number }

// cycles/cycle.types.ts
export interface Cycle { id: CycleId; teamId: TeamId; number: number;
  startsAt: Date; endsAt: Date }

// activities/activity.types.ts — written by every mutation from Phase 2 on
export type ActivityVerb =
  | "issue_created" | "title_changed" | "state_changed" | "assignee_changed"
  | "priority_changed" | "label_added" | "label_removed" | "moved_to_cycle"
  | "moved_to_project" | "commented" | "reaction_added";
export interface Activity { id: ActivityId; actorId: UserId; verb: ActivityVerb;
  entityType: "issue" | "project"; entityId: IssueId | ProjectId;
  payload: unknown;   // per-verb zod shape; formatters snapshot-tested (Phase 6)
  at: Date }

// notifications + views
export type NotificationType = "assignment" | "mention" | "subscription";
export interface Notification { id: NotificationId; userId: UserId; type: NotificationType;
  entityType: "issue" | "project"; entityId: IssueId | ProjectId;
  createdAt: Date; readAt: Date | null; snoozedUntil: Date | null }

export interface Comment { id: CommentId; issueId: IssueId; authorId: UserId;
  body: string; createdAt: Date; updatedAt: Date }
```

## 3. Filter & display specs — the app's shared vocabulary (domain/src/filters)

Both UI and API speak this structure; the Phase 5 filter-builder is *only* an editor for it. Nobody invents query semantics elsewhere.

```ts
export type FilterSpec = FilterGroup | FilterCondition;
export interface FilterGroup     { kind: "group"; op: "and" | "or"; children: FilterSpec[] }
export interface FilterCondition { kind: "cond"; key: FilterKey; op: CondOp; value: FilterValue }
export type FilterKey = "state" | "priority" | "assignee" | "creator" | "label"
  | "project" | "cycle" | "team" | "estimate" | "created" | "updated";
export type CondOp = "eq" | "neq" | "in" | "nin" | "gt" | "lt" | "gte" | "lte" | "exists";
export type FilterValue = string | number | null | Array<string | number>;

// filter.schema.ts — zod discriminated union on `kind`; the ONLY accepted wire format
// evaluate.ts — pure evaluator: (spec, issue) => boolean (used by tests and UI previews)

export interface DisplaySpec {
  groupBy: "status" | "assignee" | "priority" | "label" | "none";
  sortBy:   "priority" | "updated" | "created" | "title" | "order";
  direction: "asc" | "desc";
  showSubIssues: boolean;
}
export interface View { id: ViewId; ownerId: UserId; teamId: TeamId | null;
  name: string; filter: FilterSpec; display: DisplaySpec; isTeamDefault: boolean }
```

## 4. Domain logic modules — the seams (function signatures are the contract)

```ts
// issues/state-machine.ts
export const allowedTransitions: Record<StateCategory, readonly StateCategory[]>;
export function canTransition(from: StateCategory, to: StateCategory): boolean;
export function applyTransition(issue: Issue, to: WorkflowState, now: Date): Issue;
// stamps startedAt/completedAt/canceledAt; throws TransitionNotAllowedError

// issues/ordering.ts — fractional ordering; scheme chosen once via ADR
export function orderBetween(prev: OrderKey | null, next: OrderKey | null): OrderKey;
export function needsRebalance(keys: readonly OrderKey[]): boolean;
export function rebalance(count: number): OrderKey[];

// cycles/cycle-math.ts + cycles/rollover.ts
export type CyclePhase = "upcoming" | "current" | "past";
export function classifyCycle(c: Cycle, now: Date): CyclePhase;
export type RolloverPolicy = "next_cycle" | "backlog";
export interface RolloverPlan { moves: Array<{ issueId: IssueId; toCycleId: CycleId | null; toStateId: StateId | null }> }
export function rolloverPlan(finished: Cycle, next: Cycle | null, issues: readonly Issue[],
                             policy: RolloverPolicy, states: readonly WorkflowState[]): RolloverPlan;
// pure — the job in db/jobs executes it idempotently

// projects/rollups.ts
export interface ProjectRollup { total: number; done: number; estimateTotal: number; estimateDone: number }
export function projectRollup(issues: readonly Issue[]): ProjectRollup;
export function cycleProgress(issues: readonly Issue[], states: readonly WorkflowState[]): ProjectRollup;
// priority sort: urgent > high > medium > low > none (PRIORITY_SORT in issues/issue.types.ts)
```

## 5. Data layer interfaces (packages/db) — contract-tested

```ts
// shared list shape — one procedure, every entity
export interface ListQuery  { filter: FilterSpec; display: DisplaySpec;
                              cursor: string | null; limit: number }
export interface GroupCount { key: string; count: number }
export interface ListResult<T> { items: T[]; nextCursor: string | null; groupCounts: GroupCount[] }

// repos/issue.repo.ts — mappers convert drizzle rows ↔ domain types; rows never leak
export interface IssueRepo {
  byId(id: IssueId): Promise<Issue | null>;
  list(query: ListQuery): Promise<ListResult<Issue>>;       // bounded query count (N+1 guard)
  create(input: CreateIssueInput, order: OrderKey): Promise<Issue>;
  update(id: IssueId, patch: IssuePatch): Promise<Issue>;   // last-write-wins; 409 on stale updatedAt
  move(id: IssueId, order: OrderKey, toStateId?: StateId): Promise<Issue>;
  setLabels(id: IssueId, labelIds: LabelId[]): Promise<Issue>;
  archive(id: IssueId, at: Date | null): Promise<Issue>;
  relations(id: IssueId): Promise<IssueRelation[]>;
  nextNumber(teamId: TeamId): Promise<number>;              // allocation policy fixed by ADR
}
// one repo per aggregate: TeamRepo, StateRepo, LabelRepo, ProjectRepo,
// MilestoneRepo, CycleRepo, CommentRepo, ViewRepo, NotificationRepo, ActivityRepo (append-only)

// contracts/issue-repo.contract.ts — importable behavioral suite, run against pglite:
export const issueRepoContract = (makeRepo: () => Promise<IssueRepo>) => { /* describe/it … */ }

// jobs/rollover.job.ts — idempotent; converges if interrupted; uses rolloverPlan()
export function runCycleRollover(teamId: TeamId, clock: Clock): Promise<{ moved: number; rerunNoop: boolean }>;
```

## 6. API surface (packages/api) — thin composition

```ts
// trpc/trpc.ts — error mapping in exactly one place: DomainError.code → TRPCError
// authz.ts — the single guard every mutation passes through (reflection-tested)
export type Action = "read" | "create" | "update" | "delete" | "manage_workflow" | "manage_views";
export function assertCanAct(ctx: SessionCtx, action: Action,
                             scope: { teamId: TeamId } | { workspace: true }): void;

// list.ts — the one list procedure shape reused by issues/projects/cycles routers
// routers/<feature>.ts — validate (domain zod schemas) → call repo/domain → map result
// root.ts
export const appRouter = router({ auth, users, teams, states, labels, issues,
                                  projects, milestones, cycles, comments, views, notifications });
export type AppRouter = typeof appRouter;   // apps/web imports this type only
```

## 7. File tree

```
curves/
├── apps/web/                            # Next.js — rendering + interaction only
│   ├── app/                             # App Router
│   │   ├── (auth)/{login,signup,reset}/page.tsx
│   │   ├── inbox/page.tsx
│   │   ├── team/[key]/page.tsx
│   │   ├── issue/[key]/page.tsx
│   │   ├── projects/page.tsx · projects/[id]/page.tsx
│   │   ├── views/page.tsx · my-issues/page.tsx · roadmap/page.tsx
│   │   └── settings/{general,workflow,teams,cycles}/page.tsx
│   ├── features/                        # web-local feature folders (one hop per concern)
│   │   ├── issue-list/                  # list store seam (optimistic layer), virtualized list, row
│   │   ├── issue-detail/                # shared by split pane + full page
│   │   ├── create-issue/                # ⌘K → C composer
│   │   ├── filter-builder/              # edits FilterSpec JSON — nothing more
│   │   ├── palette/                     # cmdk
│   │   └── keyboard/                    # shortcut registry, chords, cheat sheet
│   └── lib/{trpc.ts, session.ts}
│
├── packages/
│   ├── domain/                          # PURE — no I/O, no clock, no env
│   │   ├── AGENTS.md                    # purity rules (the one package that earns a file)
│   │   └── src/
│   │       ├── core/{brand.ts, ids.ts, errors.ts, clock.ts, rng.ts}
│   │       ├── teams/{team.types.ts, team.api.ts, workflow.types.ts, workflow.api.ts}
│   │       ├── issues/{issue.types.ts, state-machine.ts, ordering.ts,
│   │       │            issue.api.ts, issue.test.ts, state-machine.test.ts, ordering.test.ts}
│   │       ├── filters/{filter.types.ts, filter.schema.ts, evaluate.ts,
│   │       │             display.types.ts, filters.api.ts, evaluate.test.ts}
│   │       ├── cycles/{cycle.types.ts, cycle-math.ts, rollover.ts, cycles.api.ts, *.test.ts}
│   │       ├── projects/{project.types.ts, rollups.ts, projects.api.ts, rollups.test.ts}
│   │       ├── activities/{activity.types.ts, verbs.ts}
│   │       ├── notifications/notification.types.ts
│   │       └── views/view.types.ts
│   │
│   ├── db/                              # Drizzle + repos + jobs; rows never leave this package
│   │   └── src/
│   │       ├── schema/{users.ts, teams.ts, team_members.ts, states.ts, labels.ts,
│   │       │           issues.ts, issue_labels.ts, issue_relations.ts, projects.ts,
│   │       │           project_issues.ts, milestones.ts, cycles.ts, cycle_issues.ts,
│   │       │           comments.ts, reactions.ts, activities.ts, notifications.ts, views.ts}
│   │       ├── migrations/              # drizzle-kit output — append-only after merge
│   │       ├── repos/{issue.repo.ts, issue.mapper.ts, team.repo.ts, …per aggregate…}
│   │       ├── contracts/{issue-repo.contract.ts, …}          # importable behavioral suites
│   │       ├── jobs/rollover.job.ts                            # idempotent cycle rollover
│   │       ├── client.ts               # the ONLY place the db client is created
│   │       ├── test-db.ts              # pglite factory for integration tests
│   │       └── seed/seed.ts            # deterministic (fixed clock + rng)
│   │
│   ├── api/                             # tRPC — validate → domain/repo → map; no business logic
│   │   └── src/
│   │       ├── trpc/{trpc.ts, context.ts, errors.ts}          # one error-mapping site
│   │       ├── auth/better-auth.ts
│   │       ├── authz.ts                                        # assertCanAct + reflection test
│   │       ├── list.ts                                         # shared list procedure shape
│   │       ├── routers/{auth.ts, users.ts, teams.ts, states.ts, labels.ts,
│   │       │             issues.ts, projects.ts, milestones.ts, cycles.ts,
│   │       │             comments.ts, views.ts, notifications.ts}
│   │       └── root.ts                                         # appRouter + export type AppRouter
│   │
│   ├── ui/                              # design system; imports nothing app-internal
│   │   └── src/{tokens.css, primitives/{button,dialog,dropdown,input,tooltip,avatar,badge}/, icons/}
│   │
│   └── config/{tsconfig/base.json, biome.json}                 # shared strict presets
│
├── docs/{plan, phases/, adr/, design/CORE_MODEL.md}
├── AGENTS.md            # small; CLAUDE.md symlinks here
├── turbo.json · package.json · .env.example
```

Conventions the tree encodes:

- **Public surfaces, not barrels**: each domain feature ends in `<feature>.api.ts`; package `exports` maps subpaths (`@curves/domain/issues`, `@curves/db/issue-repo`, …). Deep imports across package boundaries fail Biome's import restrictions; within a package, import concrete files.
- **Boundary direction** (Biome-enforced): `web → ui, api(types)` · `api → domain, db` · `db → domain` · `domain → ∅` · `ui → ∅`.
- **Tests colocated**: `*.test.ts` (pure, runs in `verify`), `*.integration.test.ts` (pglite, runs in `verify:full`). No separate test trees to hunt through.
- **`server`/`client` never appear in `apps/web`** — data access exists only behind repos in `packages/db`.
