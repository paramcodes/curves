import { describe, expect, it } from "vitest";
import { type Brand, packageName } from "./entry";

type IssueId = Brand<string, "IssueId">;

describe("@curves/domain entry", () => {
  it("exports the workspace package name and brands ids at the type level", () => {
    const issueId: IssueId = "issue_123" as IssueId;
    expect(packageName).toBe("@curves/domain");
    expect(issueId).toBe("issue_123");
  });
});
