import type { ActivityVerb } from "@curves/domain/activities/activity.types";
import type { Clock } from "@curves/domain/core/clock";
import {
  activityId,
  type CycleId,
  commentId,
  cycleId,
  type IssueId,
  issueId,
  type LabelId,
  labelId,
  type MilestoneId,
  milestoneId,
  type ProjectId,
  projectId,
  type StateId,
  stateId,
  type TeamId,
  teamId,
  type UserId,
  userId,
  viewId,
} from "@curves/domain/core/ids";
import type { Rng } from "@curves/domain/core/rng";
import { seededRng } from "@curves/domain/core/rng";
import type { DisplaySpec } from "@curves/domain/filters/display.types";
import type { FilterSpec } from "@curves/domain/filters/filter.types";
import type { OrderKey, Priority } from "@curves/domain/issues/issue.types";
import { orderBetween } from "@curves/domain/issues/ordering";
import { createActivityRepo } from "../repos/activity.repo";
import { createCommentRepo } from "../repos/comment.repo";
import { createIssueRepo, type Db } from "../repos/issue.repo";
import { cycleIssues } from "../schema/cycle_issues";
import { cycles } from "../schema/cycles";
import { labels } from "../schema/labels";
import { milestones } from "../schema/milestones";
import { projectIssues } from "../schema/project_issues";
import { projects } from "../schema/projects";
import { states } from "../schema/states";
import { teamMembers } from "../schema/team_members";
import { teams } from "../schema/teams";
import { users } from "../schema/users";
import { views } from "../schema/views";

export interface SeedSummary {
  users: number;
  teams: number;
  states: number;
  labels: number;
  issues: number;
  projectIssues: number;
  cycles: number;
  cycleIssues: number;
  comments: number;
  activities: number;
  views: number;
}

/** Indexed access is modulo the array length at every call site, so this cast is total. */
const nth = <T>(xs: readonly T[], i: number): T => xs[i] as T;

/**
 * Deterministic seed (phase-1 acceptance): identical output on every run.
 * The rules, enforced by the two-database integration test:
 * - ids are counter-derived literals ("user_ar", "team_eng", "issue_eng_7")
 *   — randomUUID never runs: repo create methods receive explicit ids;
 * - the ONLY pseudo-randomness is seededRng(42), used solely for label picks;
 * - every Date is the injected clock's anchor plus a literal offset.
 *
 * Repo vs direct inserts: issues, comments and activities go through their
 * repos (issueRepo.create performs the real ADR 0006 number allocation;
 * comments/activities get their create-time mapping), while setup rows with
 * no create method yet (users/teams/members/states/labels/project/milestone/
 * cycles/joins/views) are direct drizzle inserts. When later phases add
 * those repo methods, the seed migrates to them.
 *
 * Lifecycle stamps (startedAt/completedAt/canceledAt) are null on purpose:
 * they belong to state-machine transitions, and the seed models rows in
 * their current state — exactly what a fresh issueRepo.create produces.
 */
export const runSeed = async (db: Db, clock: Clock): Promise<SeedSummary> => {
  const anchor = clock.now().getTime();
  const at = (offsetMs: number): Date => new Date(anchor + offsetMs);
  const hour = 3_600_000;
  const day = 24 * hour;
  const rng = seededRng(42);

  // ------------------------------------------------------------- identity
  const userAr = userId("user_ar");
  const userNo = userId("user_no");
  const userSa = userId("user_sa");
  const userKi = userId("user_ki");
  const userRows = [
    {
      id: userAr,
      name: "Aria Chen",
      email: "aria@curves.dev",
      avatarUrl: null,
      createdAt: at(-60 * day),
    },
    {
      id: userNo,
      name: "Noor Haddad",
      email: "noor@curves.dev",
      avatarUrl: null,
      createdAt: at(-60 * day),
    },
    {
      id: userSa,
      name: "Sam Rivera",
      email: "sam@curves.dev",
      avatarUrl: null,
      createdAt: at(-59 * day),
    },
    {
      id: userKi,
      name: "Kim Park",
      email: "kim@curves.dev",
      avatarUrl: null,
      createdAt: at(-59 * day),
    },
  ];
  await db.insert(users).values(userRows);

  const teamEng = teamId("team_eng");
  const teamDes = teamId("team_des");
  const teamRows = [
    { id: teamEng, key: "ENG", name: "Engineering" },
    { id: teamDes, key: "DES", name: "Design" },
  ];
  await db.insert(teams).values(teamRows);

  await db.insert(teamMembers).values([
    { teamId: teamEng, userId: userAr, role: "admin" },
    { teamId: teamEng, userId: userNo, role: "member" },
    { teamId: teamEng, userId: userSa, role: "member" },
    { teamId: teamDes, userId: userKi, role: "admin" },
    { teamId: teamDes, userId: userAr, role: "member" },
  ]);

  // ------------------------------------------------------------- workflow
  const stEngBacklog = stateId("state_eng_backlog");
  const stEngTodo = stateId("state_eng_todo");
  const stEngProg = stateId("state_eng_prog");
  const stEngDone = stateId("state_eng_done");
  const stEngCanceled = stateId("state_eng_canceled");
  const stDesBacklog = stateId("state_des_backlog");
  const stDesTodo = stateId("state_des_todo");
  const stDesProg = stateId("state_des_prog");
  const stDesDone = stateId("state_des_done");
  const stateRows: Array<typeof states.$inferInsert> = [
    { id: stEngBacklog, teamId: teamEng, name: "Backlog", category: "backlog", position: 0 },
    { id: stEngTodo, teamId: teamEng, name: "Todo", category: "unstarted", position: 1 },
    { id: stEngProg, teamId: teamEng, name: "In Progress", category: "started", position: 2 },
    { id: stEngDone, teamId: teamEng, name: "Done", category: "completed", position: 3 },
    { id: stEngCanceled, teamId: teamEng, name: "Canceled", category: "canceled", position: 4 },
    { id: stDesBacklog, teamId: teamDes, name: "Backlog", category: "backlog", position: 0 },
    { id: stDesTodo, teamId: teamDes, name: "Designing", category: "unstarted", position: 1 },
    { id: stDesProg, teamId: teamDes, name: "In Review", category: "started", position: 2 },
    { id: stDesDone, teamId: teamDes, name: "Shipped", category: "completed", position: 3 },
  ];
  await db.insert(states).values(stateRows);

  const labelEngBug = labelId("label_eng_bug");
  const labelEngCore = labelId("label_eng_core");
  const labelEngPolish = labelId("label_eng_polish");
  const labelEngChore = labelId("label_eng_chore");
  const labelDesDesign = labelId("label_des_design");
  const labelDesDocs = labelId("label_des_docs");
  const labelRows = [
    { id: labelEngBug, teamId: teamEng, name: "Bug", color: "#e5484d" },
    { id: labelEngCore, teamId: teamEng, name: "Core", color: "#4b7bec" },
    { id: labelEngPolish, teamId: teamEng, name: "Polish", color: "#8e4ec6" },
    { id: labelEngChore, teamId: teamEng, name: "Chore", color: "#969799" },
    { id: labelDesDesign, teamId: teamDes, name: "Design", color: "#46a758" },
    { id: labelDesDocs, teamId: teamDes, name: "Docs", color: "#d9930d" },
  ];
  await db.insert(labels).values(labelRows);

  // -------------------------------------------------- project + milestone
  const projectPayments = projectId("project_payments");
  const milestoneM1 = milestoneId("milestone_m1");
  await db.insert(projects).values({
    id: projectPayments,
    name: "Payments revamp",
    description: "New checkout, refunds and webhook pipeline.",
    status: "in_progress",
    health: "on_track",
    leadId: userAr,
    targetDate: at(30 * day),
    createdAt: at(-45 * day),
  });
  await db.insert(milestones).values({
    id: milestoneM1,
    projectId: projectPayments,
    name: "M1 — checkout",
    targetDate: at(14 * day),
    position: 0,
  });

  // -------------------------------------------------------------- cycles
  const cycle1 = cycleId("cycle_eng_1"); // ended one day before the anchor
  const cycle2 = cycleId("cycle_eng_2"); // the current week
  const cycleRows = [
    { id: cycle1, teamId: teamEng, number: 1, startsAt: at(-21 * day), endsAt: at(-1 * day) },
    { id: cycle2, teamId: teamEng, number: 2, startsAt: at(-2 * day), endsAt: at(5 * day) },
  ];
  await db.insert(cycles).values(cycleRows);

  // -------------------------------------------------------------- issues
  const engIssues = await seedTeamIssues(db, {
    teamId: teamEng,
    prefix: "eng",
    titles: ENG_TITLES,
    stateIds: [stEngBacklog, stEngTodo, stEngProg, stEngDone, stEngCanceled],
    labelPool: [labelEngBug, labelEngCore, labelEngPolish, labelEngChore],
    priorities: [2, 0, 3, 1, 4],
    estimates: [null, 2, 3, 5, 8, 1],
    assignees: [userAr, userNo, userSa, null],
    creators: [userNo, userSa, userAr],
    createdAtOffset: (i, total) => -(total - i) * 12 * hour,
    projectIdFor: (i) => (i < 8 ? { projectId: projectPayments, milestoneId: milestoneM1 } : {}),
    // cycles: issues 2-7 scoped to the ended cycle 1, 8-13 to the current cycle 2 —
    // the explicit i >= 8 lower bound matters: without it the ternary's fallthrough
    // scopes the two OLDEST issues (i 0-1) into the current cycle (caught by the
    // determinism test's count assertion).
    cycleIdFor: (i) => (i >= 2 && i <= 7 ? cycle1 : i >= 8 && i <= 13 ? cycle2 : null),
    rng,
    at,
  });
  const desIssues = await seedTeamIssues(db, {
    teamId: teamDes,
    prefix: "des",
    titles: DES_TITLES,
    stateIds: [stDesBacklog, stDesTodo, stDesProg, stDesDone],
    labelPool: [labelDesDesign, labelDesDocs],
    priorities: [1, 3, 0, 2],
    estimates: [null, 3, 2, 5],
    assignees: [userKi, null, userAr],
    creators: [userKi, userAr],
    createdAtOffset: (i, total) => -(total - i) * day,
    projectIdFor: () => ({}),
    cycleIdFor: () => null,
    rng,
    at,
  });

  // joins mirror the denormalized columns set at creation — kept consistent
  // by construction here; the join tables carry the membership later phases
  // page through
  const projectIssueRows = engIssues.flatMap((issue) =>
    issue.projectId !== null ? [{ projectId: issue.projectId, issueId: issue.id }] : [],
  );
  await db.insert(projectIssues).values(projectIssueRows);
  const cycleIssueRows = engIssues.flatMap((issue) =>
    issue.cycleId !== null ? [{ cycleId: issue.cycleId, issueId: issue.id }] : [],
  );
  await db.insert(cycleIssues).values(cycleIssueRows);

  // --------------------------------------------------------- conversations
  const commentRepo = createCommentRepo(db);
  const commentOn = [1, 3, 5, 9, 13, 17, 21, 25, 29, 33];
  for (const [j, issueNumber] of commentOn.entries()) {
    await commentRepo.create({
      id: commentId(`comment_${j + 1}`),
      issueId: issueId(`issue_eng_${issueNumber}`),
      authorId: nth([userAr, userNo, userSa], j % 3),
      body: nth(COMMENT_BODIES, j),
      createdAt: at(-(10 - j) * 3 * hour),
    });
  }

  const activityRepo = createActivityRepo(db);
  for (const [j, verb] of ACTIVITY_VERBS.entries()) {
    await activityRepo.record({
      id: activityId(`activity_${j + 1}`),
      actorId: nth([userAr, userNo, userSa], j % 3),
      verb,
      entityType: "issue",
      entityId: issueId(`issue_eng_${(j % 15) + 1}`),
      payload: nth(ACTIVITY_PAYLOADS, j),
      at: at(-(15 - j) * 2 * hour),
    });
  }

  // ---------------------------------------------------------------- views
  const urgentBugsFilter: FilterSpec = {
    kind: "group",
    op: "and",
    children: [
      {
        kind: "group",
        op: "or",
        children: [
          { kind: "cond", key: "priority", op: "eq", value: 4 },
          { kind: "cond", key: "label", op: "in", value: [labelEngBug] },
        ],
      },
      { kind: "cond", key: "state", op: "nin", value: [stEngDone, stEngCanceled] },
    ],
  };
  const teamInboxFilter: FilterSpec = {
    kind: "group",
    op: "and",
    children: [
      { kind: "cond", key: "assignee", op: "eq", value: null },
      { kind: "cond", key: "state", op: "in", value: [stEngBacklog, stEngTodo] },
    ],
  };
  const viewRows = [
    {
      id: viewId("view_ar_urgent"),
      ownerId: userAr,
      teamId: null,
      name: "Urgent bugs",
      filter: urgentBugsFilter,
      display: {
        groupBy: "assignee",
        sortBy: "priority",
        direction: "desc",
        showSubIssues: false,
      } satisfies DisplaySpec,
      isTeamDefault: false,
    },
    {
      id: viewId("view_eng_default"),
      ownerId: userAr,
      teamId: teamEng,
      name: "Team inbox",
      filter: teamInboxFilter,
      display: {
        groupBy: "status",
        sortBy: "created",
        direction: "desc",
        showSubIssues: false,
      } satisfies DisplaySpec,
      isTeamDefault: true,
    },
  ];
  await db.insert(views).values(viewRows);

  return {
    users: userRows.length,
    teams: teamRows.length,
    states: stateRows.length,
    labels: labelRows.length,
    issues: engIssues.length + desIssues.length,
    projectIssues: projectIssueRows.length,
    cycles: cycleRows.length,
    cycleIssues: cycleIssueRows.length,
    comments: commentOn.length,
    activities: ACTIVITY_VERBS.length,
    views: viewRows.length,
  };
};

interface TeamIssueSpec {
  teamId: TeamId;
  prefix: string;
  titles: readonly string[];
  stateIds: readonly StateId[];
  labelPool: readonly LabelId[];
  priorities: readonly Priority[];
  estimates: readonly (number | null)[];
  assignees: readonly (UserId | null)[];
  creators: readonly UserId[];
  createdAtOffset: (i: number, total: number) => number;
  projectIdFor: (i: number) => { projectId?: ProjectId; milestoneId?: MilestoneId };
  cycleIdFor: (i: number) => CycleId | null;
  rng: Rng;
  at: (offsetMs: number) => Date;
}

interface CreatedIssueRef {
  id: IssueId;
  projectId: ProjectId | null;
  cycleId: CycleId | null;
}

/** Issue creation for one team — every field derived from the loop index. */
const seedTeamIssues = async (db: Db, spec: TeamIssueSpec): Promise<CreatedIssueRef[]> => {
  const issueRepo = createIssueRepo(db);
  const created: CreatedIssueRef[] = [];
  let order: OrderKey | null = null;
  for (const [i, title] of spec.titles.entries()) {
    const id = issueId(`issue_${spec.prefix}_${i + 1}`);
    order = orderBetween(order, null); // append: 0, 1, 2, … per team
    const issue = await issueRepo.create(
      {
        id,
        teamId: spec.teamId,
        title,
        description: nth(DESCRIPTIONS, i % DESCRIPTIONS.length),
        stateId: nth(spec.stateIds, i % spec.stateIds.length),
        priority: nth(spec.priorities, i % spec.priorities.length),
        estimate: nth(spec.estimates, i % spec.estimates.length) ?? null,
        assigneeId: nth(spec.assignees, i % spec.assignees.length) ?? null,
        creatorId: nth(spec.creators, i % spec.creators.length),
        ...spec.projectIdFor(i),
        cycleId: spec.cycleIdFor(i),
        labelIds: pickLabels(spec.labelPool, spec.rng),
        createdAt: spec.at(spec.createdAtOffset(i, spec.titles.length)),
      },
      order,
    );
    created.push({ id, projectId: issue.projectId, cycleId: issue.cycleId });
  }
  return created;
};

/** 0-2 distinct labels via the seeded rng — the seed's only randomness. */
const pickLabels = (pool: readonly LabelId[], rng: Rng): LabelId[] => {
  const count = Math.floor(rng.next() * 3);
  const picked = new Set<number>();
  for (let k = 0; k < count; k++) {
    picked.add(Math.floor(rng.next() * pool.length));
  }
  return [...picked].map((index) => nth(pool, index));
};

const DESCRIPTIONS = [
  "**Context**\n\nSeen while dogfooding the triage flow.",
  "**Context**\n\nReported by a design partner; steps recorded in the call notes.",
  "**Context**\n\nFollow-up from last week's cycle review.",
] as const;

const ENG_TITLES = [
  "Fix double charge when card is retried during checkout",
  "Webhook deliveries silently retry forever after 410",
  "Add refund support to the payments API",
  "Keyboard shortcut editor overrides browser defaults",
  "Reduce bundle size below 200kb for the issue list",
  "Issue list flickers when switching views quickly",
  "Support markdown tables in issue descriptions",
  "Search results skip issues in archived projects",
  "Add estimate rollups to the project header",
  "Notifications mark themselves read on focus steal",
  "Persist sidebar collapse state per workspace",
  "Command palette should learn recent items",
  "Cycle scope creep indicator drifts by one issue",
  "Export issues to CSV drops the last row",
  "Add cycle auto-rollout setting per team",
  "Draft comments lost when session expires",
  "Sub-issue indentation breaks past depth five",
  "Add bulk priority change from the list view",
  "Realtime presence flickers on slow connections",
  "Triage view should exclude archived issues",
  "Fix timezone drift in cycle boundary emails",
  "Add labels to the issue export",
  "Optimistic reorder reverts on flaky wifi",
  "Slack integration drops threads on long titles",
  "Add keyboard-first milestone picker",
  "Fix duplicated activity feed entries on label toggle",
  "Roadmap bars overlap when milestones share a date",
  "Add saved view sharing with teammates",
  "API rate limiter counts internal calls",
  "Issue detail scroll position resets on save",
  "Support emoji reactions on comments",
  "Fix hover card memory leak on the issue list",
  "Add print stylesheet for cycle reports",
  "Autocomplete mentions should prefer teammates",
  "Offline mode loses unsaved triage changes",
  "Fix estimate field accepting negative numbers",
  "Add a filter for 'no cycle' issues",
  "Project health badge stale after rollover",
  "Duplicate issue should copy labels and cycle",
  "Fix sort instability when priorities tie",
  "Add Urdu locale to the interface strings",
  "Notification badge count includes read items",
  "Password reset emails land in promotions tab",
  "Add tooltip keyboard discovery to the toolbar",
  "Migrate legacy webhooks to the signed format",
  "Issue number gaps confuse the support macros",
  "Add grouping by estimate to the list view",
  "Fix pagination cursor skipping ties",
  "Backfill order keys for pre-1.0 issues",
  "Ship the triage view beta flag",
] as const;

const DES_TITLES = [
  "Audit empty states across the app",
  "Define motion vocabulary for list transitions",
  "Redesign the cycle completion chart",
  "Dark mode contrast fails on status badges",
  "Create an illustration set for onboarding",
  "Icon audit: inconsistent stroke weights",
  "Prototype the new issue composer layout",
  "Write UX copy guidelines for errors",
] as const;

const COMMENT_BODIES = [
  "Reproduced on staging — happens only when the card was saved before.",
  "This shipped to customers? We should hotfix.",
  "Rollup math checks out against the fixtures now.",
  "Leaving for next cycle, blocked on the API change.",
  "Cut scope: the export can wait, the flicker can't.",
  "QA passed on Chrome and Safari.",
  "Splitting the offline work into its own issue.",
  "Customer reported this again today — raising priority.",
  "The webhook logs show a 410 loop, attaching traces.",
  "Nice find. Let's document the shortcut in the cheat sheet.",
] as const;

const ACTIVITY_VERBS: readonly ActivityVerb[] = [
  "issue_created",
  "title_changed",
  "state_changed",
  "assignee_changed",
  "priority_changed",
  "label_added",
  "label_removed",
  "moved_to_cycle",
  "moved_to_project",
  "commented",
  "reaction_added",
  "state_changed",
  "assignee_changed",
  "label_added",
  "issue_created",
];

const ACTIVITY_PAYLOADS: readonly unknown[] = [
  { title: "Fix double charge when card is retried during checkout" },
  { from: "Double charge on retry", to: "Fix double charge when card is retried during checkout" },
  { from: "state_eng_backlog", to: "state_eng_todo" },
  { from: null, to: "user_sa" },
  { from: 2, to: 3 },
  { label: "label_eng_bug" },
  { label: "label_eng_chore" },
  { from: null, to: "cycle_eng_2" },
  { from: null, project: "project_payments" },
  { commentId: "comment_1" },
  { emoji: "eyes" },
  { from: "state_eng_todo", to: "state_eng_prog" },
  { from: "user_sa", to: null },
  { label: "label_eng_core" },
  { title: "Webhook deliveries silently retry forever after 410" },
];
