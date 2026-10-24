import { describe, expect, expectTypeOf, it } from "vitest";
import { type IssueId, issueId, type TeamId, teamId, userId } from "./ids";

describe("branded ids", () => {
  it("constructors round-trip the input", () => {
    expect(issueId("issue_123")).toBe("issue_123");
    expect(teamId("team_eng")).toBe("team_eng");
    expect(userId("user_1")).toBe("user_1");
  });

  it("brands are distinct at the type level", () => {
    const takesIssue = (id: IssueId): IssueId => id;
    const takesTeam = (id: TeamId): TeamId => id;
    expect(takesIssue(issueId("x"))).toBe("x");
    expect(takesTeam(teamId("x"))).toBe("x");
    // @ts-expect-error an IssueId must not be accepted where a TeamId is required
    takesTeam(issueId("x"));
    expectTypeOf(issueId).returns.toEqualTypeOf<IssueId>();
  });
});
