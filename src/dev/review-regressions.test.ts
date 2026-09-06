import { expect, it } from "vitest";
import i18next from "i18next";
import en from "@/i18n/locales/en.json";
import zh from "@/i18n/locales/zh.json";
import { moreFixture } from "./more-fixtures";
import { workspaceFixture } from "./workspace-fixtures";
import type * as Data from "@/features/github/github-data";

const repository: Data.GitHubRepository = {
  id: 1,
  owner: "harbor-preview",
  name: "harbor",
  fullName: "harbor-preview/harbor",
  url: "https://github.com/harbor-preview/harbor",
  stars: 1,
  forks: 1,
  openIssues: 1,
  defaultBranch: "main",
  isPrivate: false,
  isFork: false,
  isArchived: false,
};

it.each([false, true])(
  "keeps unrelated issue totals out of commit/file/relationship pages (empty=%s)",
  (empty) => {
    const read = (command: string) => workspaceFixture(command, {}, [repository], empty);
    const commits = read("github_list_pull_request_commits") as Data.GitHubRepositoryCommitPage;
    const files = read("github_list_pull_request_files") as Data.GitHubPullRequestFilePage;
    const relationships = read(
      "github_get_repository_issue_relationships"
    ) as Data.GitHubIssueRelationshipsPage;
    expect(commits).not.toHaveProperty("totalCount");
    expect(files).not.toHaveProperty("totalCount");
    expect(relationships).not.toHaveProperty("totalCount");
  }
);

it("keeps notification repositories defined for a one-repository or empty fixture", () => {
  const page = moreFixture(
    "github_list_notifications",
    {},
    [repository],
    false
  ) as Data.GitHubNotificationPage;
  expect(page.notifications).toHaveLength(4);
  expect(page.notifications.every((item) => item.repository.id === repository.id)).toBe(true);
  expect(page.notifications.map(({ subject }) => [subject.kind, subject.url])).toEqual([
    ["issue", `${repository.url}/issues/1`],
    ["pullRequest", `${repository.url}/pull/1`],
    ["issue", `${repository.url}/issues/1`],
    ["pullRequest", `${repository.url}/pull/1`],
  ]);
  expect(
    (moreFixture("github_list_notifications", {}, [], false) as Data.GitHubNotificationPage)
      .notifications
  ).toEqual([]);
});

it("resolves unsuffixed Chinese counted labels before the English fallback", async () => {
  const instance = i18next.createInstance();
  await instance.init({
    lng: "zh",
    fallbackLng: "en",
    resources: { en: { translation: en }, zh: { translation: zh } },
  });
  for (const count of [0, 1, 2]) {
    expect(instance.t("workspace.gists.comments", { count })).toBe(`${count} 条评论`);
    expect(instance.t("workspace.gists.fileCount", { count })).toBe(`${count} 个文件`);
    expect(instance.t("workspace.gists.loadedCount", { count })).toBe(`已加载 ${count} 条`);
    expect(instance.t("workspace.packages.versionCount", { count })).toBe(`${count} 个版本`);
    expect(instance.t("workspace.projects.itemCount", { count })).toBe(`${count} 项`);
    expect(instance.t("workspace.repositories.reviewReplyCount", { count })).toBe(
      `${count} 条评论`
    );
  }
});
