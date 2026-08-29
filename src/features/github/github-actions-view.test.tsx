import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { GitHubRepository, GitHubWorkflowRun } from "./github-data";
import { WorkflowRunRow } from "./github-actions-view";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("@/hooks/use-app-translation", () => ({
  useAppTranslation: () => ({ t: (key: string) => key }),
}));

const repository: GitHubRepository = {
  id: 1,
  owner: "octocat",
  name: "hello-world",
  fullName: "octocat/hello-world",
  url: "https://github.com/octocat/hello-world",
  stars: 0,
  forks: 0,
  openIssues: 0,
  defaultBranch: "main",
  isPrivate: false,
  isFork: false,
  isArchived: false,
};

const run: GitHubWorkflowRun = {
  id: 42,
  workflowId: 7,
  workflowName: "CI",
  title: "Keep Actions inside Harbor",
  runNumber: 19,
  runAttempt: 1,
  event: "push",
  status: "completed",
  conclusion: "success",
  headBranch: "main",
  headSha: "abcdef123456",
  headCommitMessage: "Keep Actions inside Harbor",
  actor: "octocat",
  actorAvatarUrl: "https://github.com/octocat.png",
  createdAt: "2026-08-26T08:00:00Z",
  updatedAt: "2026-08-26T08:05:00Z",
  startedAt: "2026-08-26T08:00:05Z",
  url: "https://github.com/octocat/hello-world/actions/runs/42",
};

function renderRow(value: GitHubWorkflowRun) {
  return renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}>
      <WorkflowRunRow
        repository={repository}
        run={value}
        locale="en"
        onSelect={vi.fn()}
        onPrefetch={vi.fn()}
      />
    </QueryClientProvider>
  );
}

describe("WorkflowRunRow", () => {
  it("places eligible run deletion behind an accessible destructive menu", () => {
    const html = renderRow(run);

    expect(html).toContain('aria-label="workspace.repositories.workflowRunActions"');
    expect(html).not.toContain("workspace.repositories.deleteWorkflowRunTitle");
  });

  it("does not offer deletion for a recent in-progress run", () => {
    const html = renderRow({
      ...run,
      status: "in_progress",
      conclusion: null,
      createdAt: new Date().toISOString(),
    });

    expect(html).not.toContain("workspace.repositories.workflowRunActions");
  });
});
