import { describe, expect, it } from "vitest";
import {
  issueDetailLocation,
  popIssueDetailLocation,
  pushIssueDetailLocation,
} from "./github-issue-detail-navigation";

const repository = {
  owner: "octocat",
  name: "hello-world",
  url: "https://github.com/octocat/hello-world",
  defaultBranch: "main",
};

describe("GitHub Issue detail navigation", () => {
  it("keeps a native cross-repository history without duplicate current entries", () => {
    const root = issueDetailLocation(repository, 7);
    const parent = issueDetailLocation(
      {
        owner: "octocat",
        name: "roadmap",
        url: "https://github.com/octocat/roadmap",
        defaultBranch: "HEAD",
      },
      3
    );

    const nested = pushIssueDetailLocation([root], parent);
    expect(nested).toEqual([root, parent]);
    expect(pushIssueDetailLocation(nested, parent)).toBe(nested);
    expect(popIssueDetailLocation(nested)).toEqual([root]);
    expect(popIssueDetailLocation([root])).toEqual([root]);
  });
});
