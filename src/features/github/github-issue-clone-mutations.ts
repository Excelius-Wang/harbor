import { invoke } from "@tauri-apps/api/core";
import type { GitHubIssueClone } from "./github-data";
import type { GitHubIssueCloneTarget } from "./github-issue-clone-queries";

export type GitHubIssueCloneInput = {
  expectedIssueNodeId: string;
  title: string;
  body: string;
};

export function cloneRepositoryIssue(target: GitHubIssueCloneTarget, input: GitHubIssueCloneInput) {
  return invoke<GitHubIssueClone>("github_clone_repository_issue", {
    ...target,
    ...input,
  });
}
