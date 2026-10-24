import { describe, expect, expectTypeOf, it } from "vitest";
import type { Activity, ActivityVerb } from "../activities/activity.types";
import { fixedClock } from "../core/clock";
import {
  activityId,
  commentId,
  cycleId,
  issueId,
  labelId,
  milestoneId,
  notificationId,
  projectId,
  stateId,
  teamId,
  userId,
} from "../core/ids";
import type { Cycle } from "../cycles/cycle.types";
import type { Notification, NotificationType } from "../notifications/notification.types";
import type {
  Project,
  ProjectHealth,
  ProjectMilestone,
  ProjectStatus,
} from "../projects/project.types";
import type { Team, TeamMember, TeamRole, User } from "../teams/team.types";
import type { Label, StateCategory, WorkflowState } from "../teams/workflow.types";
import type { Comment } from "./comment.types";
import type { Issue, IssueRelation, RelationType } from "./issue.types";
import { issueIdentifier, type OrderKey, PRIORITY_NAME, type Priority } from "./issue.types";

describe("issueIdentifier", () => {
  it("formats team key and number", () => {
    expect(issueIdentifier("ENG", 101)).toBe("ENG-101");
    expect(issueIdentifier("DES", 1)).toBe("DES-1");
  });
});

describe("PRIORITY_NAME", () => {
  it("covers all five priorities", () => {
    const priorities: Priority[] = [0, 1, 2, 3, 4];
    expect(priorities.map((p) => PRIORITY_NAME[p])).toEqual([
      "No priority",
      "Low",
      "Medium",
      "High",
      "Urgent",
    ]);
  });
});

describe("entity types", () => {
  it("constructs a full sample Issue via the id constructors", () => {
    const at = fixedClock("2026-10-24T10:00:00Z").now();
    const order = "a1" as OrderKey;
    const issue: Issue = {
      id: issueId("issue_1"),
      teamId: teamId("team_eng"),
      number: 101,
      title: "Fix the curve",
      description: "It bends the wrong way",
      stateId: stateId("state_todo"),
      priority: 3,
      estimate: 5,
      assigneeId: userId("user_ada"),
      creatorId: userId("user_grace"),
      parentId: null,
      labelIds: [labelId("label_bug")],
      order,
      projectId: projectId("proj_apex"),
      milestoneId: milestoneId("ms_1"),
      cycleId: cycleId("cycle_42"),
      createdAt: at,
      updatedAt: at,
      startedAt: at,
      completedAt: null,
      canceledAt: null,
      archivedAt: null,
    };
    expect(issue.id).toBe("issue_1");
    expect(issue.number).toBe(101);
    expect(issue.order).toBe("a1");
  });

  it("constructs the supporting entities", () => {
    const at = fixedClock("2026-10-24T10:00:00Z").now();
    const user: User = {
      id: userId("user_1"),
      name: "Ada",
      email: "ada@example.com",
      emailVerified: false,
      avatarUrl: null,
      createdAt: new Date(at),
    };
    const team: Team = { id: teamId("team_1"), key: "ENG", name: "Engineering" };
    const member: TeamMember = { teamId: team.id, userId: user.id, role: "admin" };
    expectTypeOf(member.role).toEqualTypeOf<TeamRole>();
    const category: StateCategory = "started";
    const state: WorkflowState = {
      id: stateId("state_1"),
      teamId: team.id,
      name: "In Progress",
      category,
      position: 2,
    };
    const label: Label = { id: labelId("label_1"), teamId: team.id, name: "bug", color: "#ff0000" };
    const project: Project = {
      id: projectId("proj_1"),
      name: "Apex",
      description: "",
      status: "in_progress",
      health: "on_track",
      leadId: user.id,
      targetDate: null,
      createdAt: at,
    };
    expectTypeOf(project.status).toEqualTypeOf<ProjectStatus>();
    expectTypeOf(project.health).toEqualTypeOf<ProjectHealth | null>();
    const milestone: ProjectMilestone = {
      id: milestoneId("ms_1"),
      projectId: project.id,
      name: "Beta",
      targetDate: null,
      position: 0,
    };
    const cycle: Cycle = {
      id: cycleId("cycle_1"),
      teamId: team.id,
      number: 1,
      startsAt: at,
      endsAt: at,
    };
    const comment: Comment = {
      id: commentId("c_1"),
      issueId: issueId("issue_1"),
      authorId: user.id,
      body: "hi",
      createdAt: at,
      updatedAt: at,
    };
    const verb: ActivityVerb = "commented";
    const activity: Activity = {
      id: activityId("a_1"),
      actorId: user.id,
      verb,
      entityType: "issue",
      entityId: issueId("issue_1"),
      payload: { commentId: comment.id },
      at,
    };
    const type: NotificationType = "mention";
    const notification: Notification = {
      id: notificationId("n_1"),
      userId: user.id,
      type,
      entityType: "issue",
      entityId: issueId("issue_1"),
      createdAt: at,
      readAt: null,
      snoozedUntil: null,
    };
    const relationType: RelationType = "blocks";
    const relation: IssueRelation = {
      issueId: issueId("issue_1"),
      relatedIssueId: issueId("issue_2"),
      type: relationType,
    };

    expect(member.role).toBe("admin");
    expect(state.category).toBe("started");
    expect(label.color).toBe("#ff0000");
    expect(project.status).toBe("in_progress");
    expect(milestone.position).toBe(0);
    expect(cycle.number).toBe(1);
    expect(comment.authorId).toBe("user_1");
    expect(activity.verb).toBe("commented");
    expect(notification.type).toBe("mention");
    expect(relation.type).toBe("blocks");
  });

  it("keeps brands distinct at the type level", () => {
    expectTypeOf(issueId).returns.toEqualTypeOf<Issue["id"]>();
    expectTypeOf<Issue["order"]>().toEqualTypeOf<OrderKey>();
    expectTypeOf<Issue["priority"]>().toEqualTypeOf<Priority>();
  });
});
