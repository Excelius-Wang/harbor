import { describe, expect, it } from "vitest";
import { hasPullRequestBranchUpdateCompleted } from "./github-pull-request-branch-update";

describe("GitHub pull request branch update reconciliation", () => {
  it("waits while every authoritative view still reports the guarded head", () => {
    expect(hasPullRequestBranchUpdateCompleted("abc1234", ["abc1234", "abc1234"])).toBe(false);
    expect(hasPullRequestBranchUpdateCompleted("abc1234", [undefined, "abc1234"])).toBe(false);
  });

  it("finishes when either detail or branch status observes a new head", () => {
    expect(hasPullRequestBranchUpdateCompleted("abc1234", ["def5678", "abc1234"])).toBe(true);
    expect(hasPullRequestBranchUpdateCompleted("abc1234", ["abc1234", "def5678"])).toBe(true);
  });
});
