// @vitest-environment jsdom

import type * as Data from "@/features/github/github-data";
import { invoke } from "./preview-core";
import { clearMocks } from "@tauri-apps/api/mocks";
import { afterEach, describe, expect, it, vi } from "vitest";
import { installPreview } from "./preview";

it("requires Gist write opt-in and reconciles accepted edits with subsequent reads", async () => {
  vi.stubGlobal("isTauri", false);
  history.replaceState(null, "", "/?gists=files");
  installPreview();
  const target = { gistId: "preview-gist-1" };
  await expect(
    invoke("github_update_gist_star", { ...target, starred: true })
  ).rejects.toMatchObject({ code: "previewFixtureMissing" });
  history.replaceState(null, "", "/?gists=files&writes=accept");
  installPreview();
  await invoke("github_update_gist_star", { ...target, starred: true });
  expect((await invoke<Data.GitHubGist>("github_get_gist", target)).starred).toBe(true);
  await expect(invoke("github_unknown_gist_write", target)).rejects.toMatchObject({
    code: "previewFixtureMissing",
  });
});

afterEach(() => {
  history.replaceState(null, "", "/");
  vi.unstubAllGlobals();
  clearMocks();
  delete document.documentElement.dataset.previewBackground;
  delete document.documentElement.dataset.uiPreview;
});

describe("UI preview isolation", () => {
  it("serves discovery fixtures and rejects unimplemented business writes", async () => {
    vi.stubGlobal("isTauri", false);
    installPreview();
    const result = await invoke<{ results: { owner: string }[] }>("github_search_discovery", {
      kind: "repositories",
    });
    expect(result.results[0].owner).toBe("harbor-preview");
    await expect(invoke("github_delete_repository_issue", { number: 1 })).rejects.toMatchObject({
      code: "previewFixtureMissing",
    });
  });

  it("keeps a known null response distinct from a missing fixture", async () => {
    vi.stubGlobal("isTauri", false);
    installPreview();
    await expect(invoke("github_get_pending_repository_pull_request_review")).resolves.toBeNull();
  });

  it("scopes a failure to selected commands while preserving workspace navigation", async () => {
    vi.stubGlobal("isTauri", false);
    history.replaceState(null, "", "/?state=error&commands=github_list_repository_workflow_runs");
    installPreview();
    const result = await invoke<{ repositories: unknown[] }>("github_list_repositories");
    expect(result.repositories.length).toBeGreaterThan(0);
    await expect(invoke("github_list_repository_workflow_runs")).rejects.toMatchObject({
      code: "preview",
    });
  });

  it("forwards native window calls while keeping business calls inside the preview", async () => {
    const nativeIPC = vi.fn().mockResolvedValue(false);
    vi.stubGlobal("isTauri", true);
    const internals = {};
    Object.defineProperty(internals, "invoke", { value: nativeIPC });
    vi.stubGlobal("__TAURI_INTERNALS__", internals);
    installPreview();
    await invoke("plugin:window|is_maximized");
    expect(nativeIPC).toHaveBeenCalledWith("plugin:window|is_maximized", {}, undefined);
    expect(Object.getOwnPropertyDescriptor(internals, "invoke")?.writable).toBe(false);
    await expect(invoke("github_mutate_repository_issue", { number: 1 })).rejects.toMatchObject({
      code: "previewFixtureMissing",
    });
    await invoke("sync_window_vibrancy", { enabled: false });
    expect(nativeIPC).toHaveBeenCalledWith("sync_window_vibrancy", { enabled: false }, undefined);
    expect(nativeIPC).toHaveBeenCalledTimes(2);
    expect(document.documentElement.dataset.previewBackground).toBeUndefined();
  });
});

it("requires repository-action write opt-in and never forwards unknown repository mutations", async () => {
  vi.stubGlobal("isTauri", false);
  history.replaceState(null, "", "/?repoActions=external");
  installPreview();
  const target = { owner: "harbor-community", repository: "harbor" };
  await expect(
    invoke("github_update_repository_star", { ...target, starred: true })
  ).rejects.toMatchObject({ code: "previewFixtureMissing" });
  history.replaceState(null, "", "/?repoActions=external&writes=accept");
  installPreview();
  await expect(invoke("github_delete_personal_repository", target)).rejects.toMatchObject({
    code: "previewFixtureMissing",
  });
});

it("routes opted-in conversation, reaction and pin writes through isolated fixtures", async () => {
  vi.stubGlobal("isTauri", false);
  history.replaceState(
    null,
    "",
    "/?conversation=standard&reactions=readonly&pins=standard&writes=accept"
  );
  installPreview();
  const target = { owner: "harbor-preview", repository: "harbor" };
  const conversation = { ...target, conversationKind: "pullRequest", conversationNumber: 2 };
  expect(await invoke("github_get_repository_conversation_controls", conversation)).toMatchObject({
    kind: "pullRequest",
    number: 2,
    locked: false,
  });
  await invoke("github_update_repository_conversation_lock", {
    ...conversation,
    action: "lock",
    reason: "resolved",
  });
  expect(
    (
      await invoke<Data.GitHubPullRequestDetailPage>("github_get_repository_pull_request", {
        ...target,
        pullRequestNumber: 2,
      })
    ).pullRequest.locked
  ).toBe(true);
  const subject = { kind: "issue", id: "I_preview_1" };
  const reactions = await invoke<Data.GitHubReactionSubject>("github_update_repository_reaction", {
    ...target,
    subject,
    content: "heart",
    reacted: false,
  });
  expect(reactions.viewerCanReact).toBe(false);
  expect(reactions.groups.some((group) => group.content === "heart")).toBe(false);
  await invoke("github_update_repository_issue_pin", {
    input: { ...target, issueNumber: 1, expectedIssueNodeId: subject.id, action: "pin" },
  });
  expect(
    (
      await invoke<Data.GitHubPinnedIssuePage>("github_get_repository_pinned_issues", target)
    ).issues.some((issue) => issue.nodeId === subject.id)
  ).toBe(true);
  await expect(
    invoke("github_delete_repository_issue", { ...target, issueNumber: 1 })
  ).rejects.toMatchObject({ code: "previewFixtureMissing" });
});

it("provides Project field fixtures and reconciles only opted-in Project writes", async () => {
  vi.stubGlobal("isTauri", false);
  history.replaceState(null, "", "/?projects=fields");
  installPreview();
  await expect(
    invoke("github_create_personal_project", { title: "New roadmap" })
  ).rejects.toMatchObject({ code: "previewFixtureMissing" });
  history.replaceState(null, "", "/?projects=fields&writes=accept");
  installPreview();
  const project = await invoke<Data.GitHubProjectSummary>("github_create_personal_project", {
    title: "New roadmap",
  });
  const detail = await invoke<Data.GitHubProjectDetail>("github_get_personal_project", {
    number: project.number,
  });
  expect(detail.fields.map((field) => field.dataType)).toEqual(
    expect.arrayContaining(["text", "number", "singleSelect", "multiSelect", "date", "iteration"])
  );
  expect(detail.items.items).toEqual([]);
  const item = await invoke<Data.GitHubProjectItem>("github_add_personal_project_item", {
    number: project.number,
    addition: { kind: "draftIssue", title: "My draft", body: "My body" },
  });
  expect(
    (
      await invoke<Data.GitHubProjectDetail>("github_get_personal_project", {
        number: project.number,
      })
    ).items.items[0].id
  ).toBe(item.id);
  await expect(invoke("github_delete_repository_issue", { issueNumber: 1 })).rejects.toMatchObject({
    code: "previewFixtureMissing",
  });
});

it("reconciles simulated repository writes without mutating previously returned DTOs", async () => {
  vi.stubGlobal("isTauri", false);
  history.replaceState(null, "", "/?repoActions=external&writes=accept");
  installPreview();
  const target = { owner: "harbor-community", repository: "harbor" };
  const before = await invoke<Data.GitHubRepositoryPage>("github_list_repositories");
  await invoke("github_update_repository_star", { ...target, starred: true });
  const starred = await invoke<Data.GitHubStarredRepositoryPage>(
    "github_list_starred_repositories"
  );
  expect(starred.repositories[0].repository.stars).toBe(before.repositories[0].stars + 1);
  expect(before.repositories[0].stars).toBe(1348);
  await invoke("github_update_repository_watch", { ...target, watchLevel: "ignored" });
  expect(
    await invoke<Data.GitHubRepositoryRelationship>("github_get_repository_relationship", target)
  ).toMatchObject({ starred: true, watchLevel: "ignored" });
  await invoke("github_update_repository_star", { ...target, starred: false });
  expect(
    (await invoke<Data.GitHubStarredRepositoryPage>("github_list_starred_repositories"))
      .repositories
  ).toHaveLength(0);
  const fork = await invoke<Data.GitHubForkResult>("github_fork_repository", {
    ...target,
    name: "my-copy",
    defaultBranchOnly: true,
  });
  expect(fork).toMatchObject({
    created: true,
    repository: { fullName: "harbor-preview/my-copy", isFork: true },
  });
  expect(before.repositories).toHaveLength(8);
  expect(before.repositories[0].forks).toBe(124);
  const input: Data.GitHubRepositoryCreateInput = {
    name: "new-harbor",
    visibility: "private",
    initializeWithReadme: true,
    hasIssues: true,
    hasProjects: false,
    hasWiki: false,
    hasDiscussions: true,
  };
  const created = await invoke<Data.GitHubRepositorySettings>("github_create_personal_repository", {
    input,
  });
  expect(created).toMatchObject({
    repository: { fullName: "harbor-preview/new-harbor", isPrivate: true },
    hasProjects: false,
    hasDiscussions: true,
  });
  const after = await invoke<Data.GitHubRepositoryPage>("github_list_repositories");
  expect(after.repositories).toHaveLength(10);
  expect(
    await invoke("github_get_personal_repository_settings", {
      owner: "harbor-preview",
      repository: "new-harbor",
    })
  ).toEqual(created);
  history.replaceState(null, "", "/");
  installPreview();
  expect(
    (await invoke<Data.GitHubRepositoryPage>("github_list_repositories")).repositories[0]
  ).toMatchObject({ owner: "harbor-preview", stars: 1348, forks: 124 });
});

it("supplies the sign-in configuration shape used by the production dialog", async () => {
  vi.stubGlobal("isTauri", false);
  installPreview();
  await expect(invoke("github_login_availability")).resolves.toEqual({ configured: true });
});

it("simulates only the opted-in workflow actions and reconciles their read fixtures", async () => {
  vi.stubGlobal("isTauri", false);
  history.replaceState(null, "", "/?actions=failed&writes=accept");
  installPreview();
  const target = { owner: "harbor-preview", repository: "harbor", runId: 1 };
  expect(
    (await invoke<Data.GitHubWorkflowRun>("github_get_repository_workflow_run", target)).conclusion
  ).toBe("failure");
  await invoke("github_request_workflow_run_action", { ...target, action: "rerunAll" });
  expect(
    (await invoke<Data.GitHubWorkflowRun>("github_get_repository_workflow_run", target)).status
  ).toBe("queued");
  await invoke("github_delete_repository_workflow_run", target);
  expect(
    (
      await invoke<Data.GitHubWorkflowRunPage>("github_list_repository_workflow_runs", target)
    ).runs.some((run) => run.id === 1)
  ).toBe(false);
  await expect(invoke("github_delete_repository_issue", { number: 1 })).rejects.toMatchObject({
    code: "previewFixtureMissing",
  });
});

it("removes acknowledged notification targets from the controlled inbox", async () => {
  vi.stubGlobal("isTauri", false);
  history.replaceState(null, "", "/?notifications=targets");
  installPreview();
  const before = await invoke<Data.GitHubNotificationPage>("github_list_notifications");
  expect(
    before.notifications.some((notification) => notification.subject.kind === "checkSuite")
  ).toBe(true);
  await invoke("github_update_notification", {
    threadId: before.notifications[0].id,
    action: "read",
  });
  const after = await invoke<Data.GitHubNotificationPage>("github_list_notifications");
  expect(after.notifications).toHaveLength(before.notifications.length - 1);
  expect(
    after.notifications.some((notification) => notification.id === before.notifications[0].id)
  ).toBe(false);
});

it("keeps Wiki revision identities distinct and reconciles a simulated restore", async () => {
  vi.stubGlobal("isTauri", false);
  history.replaceState(null, "", "/?wiki=history&writes=accept");
  installPreview();
  const target = { owner: "harbor-preview", repository: "harbor", path: "Home.md" };
  const historyPage = await invoke<Data.GitHubWikiHistoryPage>(
    "github_list_repository_wiki_history",
    target
  );
  const current = historyPage.revisions[0];
  const previous = historyPage.revisions[1];
  expect(current.sha).not.toBe(previous.sha);
  const revision = await invoke<Data.GitHubWikiRevision>("github_get_repository_wiki_revision", {
    ...target,
    commitSha: previous.sha,
  });
  expect(revision.revision.sha).toBe(previous.sha);
  const restored = await invoke<Data.GitHubWikiMutationResult>(
    "github_revert_repository_wiki_page",
    {
      owner: target.owner,
      repository: target.repository,
      input: {
        path: target.path,
        expectedHead: current.sha,
        expectedBlobSha: current.sha,
        sourceCommitSha: previous.sha,
      },
    }
  );
  expect(restored.page?.content).toBe(revision.content);
  expect(restored.overview.headSha).not.toBe(current.sha);
  const refreshed = await invoke<Data.GitHubWikiOverview>("github_get_repository_wiki", target);
  expect(refreshed.headSha).toBe(restored.overview.headSha);
});
