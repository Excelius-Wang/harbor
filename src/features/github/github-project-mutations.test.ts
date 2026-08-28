import { InfiniteQueryObserver, QueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  GitHubProjectDetail,
  GitHubProjectItem,
  GitHubProjectPage,
  GitHubProjectSummary,
} from "./github-data";
import {
  changePersonalProjectItem,
  syncDeletedPersonalProject,
  syncPersonalProjectItem,
  updatePersonalProjectItem,
} from "./github-project-mutations";
import {
  githubQueryKeys,
  personalProjectQueryOptions,
  personalProjectsQueryOptions,
} from "./github-queries";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

const project: GitHubProjectSummary = {
  id: "PVT_personal",
  number: 3,
  title: "Harbor roadmap",
  shortDescription: "Personal delivery plan",
  url: "https://github.com/users/octocat/projects/3",
  public: false,
  closed: false,
  itemCount: 1,
  updatedAt: "2026-08-28T08:00:00Z",
  viewerCanUpdate: true,
  viewerCanClose: true,
  viewerCanReopen: false,
};

const item: GitHubProjectItem = {
  id: "PVTI_item",
  archived: false,
  content: { kind: "draftIssue", id: "DI_draft", title: "Ship Projects", body: "" },
  fieldValues: [],
  createdAt: "2026-08-27T08:00:00Z",
  updatedAt: "2026-08-28T08:00:00Z",
};

const detail: GitHubProjectDetail = {
  project,
  readme: "",
  fields: [],
  views: [],
  items: { items: [item], totalCount: 1, endCursor: null, hasMore: false },
};

function createClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Number.POSITIVE_INFINITY } },
  });
}

describe("personal GitHub Projects", () => {
  beforeEach(() => vi.mocked(invoke).mockReset());

  it("paginates personal project lists with exact filters", async () => {
    const client = createClient();
    vi.mocked(invoke)
      .mockResolvedValueOnce({
        projects: [project],
        totalCount: 2,
        endCursor: "next",
        hasMore: true,
      })
      .mockResolvedValueOnce({ projects: [], totalCount: 2, endCursor: null, hasMore: false });
    const options = personalProjectsQueryOptions({
      state: "open",
      query: "harbor",
      sort: "updated",
    });
    await client.fetchInfiniteQuery(options);
    const observer = new InfiniteQueryObserver(client, options);
    const unsubscribe = observer.subscribe(() => undefined);
    await observer.fetchNextPage();
    unsubscribe();

    expect(options.queryKey).toEqual(["github", "personal-projects", "open", "harbor", "updated"]);
    expect(invoke).toHaveBeenNthCalledWith(1, "github_list_personal_projects", {
      projectState: "open",
      query: "harbor",
      sort: "updated",
      after: null,
    });
    expect(invoke).toHaveBeenNthCalledWith(2, "github_list_personal_projects", {
      projectState: "open",
      query: "harbor",
      sort: "updated",
      after: "next",
    });
  });

  it("keeps item filters and cursors in a project-scoped cache", async () => {
    const client = createClient();
    vi.mocked(invoke).mockResolvedValueOnce(detail);
    const options = personalProjectQueryOptions({
      number: 3,
      query: "status:Todo",
      archived: false,
    });
    await client.fetchInfiniteQuery(options);

    expect(options.queryKey).toEqual(["github", "personal-project", 3, "status:Todo", false]);
    expect(invoke).toHaveBeenCalledWith("github_get_personal_project", {
      number: 3,
      query: "status:Todo",
      archived: false,
      after: null,
    });
  });

  it("sends typed field updates and item lifecycle actions", async () => {
    vi.mocked(invoke).mockResolvedValue(item);
    await updatePersonalProjectItem(3, item.id, {
      kind: "singleSelect",
      fieldId: "PVTSSF_status",
      optionId: "todo",
    });
    await changePersonalProjectItem(3, item.id, "archive");

    expect(invoke).toHaveBeenNthCalledWith(1, "github_update_personal_project_item", {
      number: 3,
      itemId: item.id,
      update: { kind: "singleSelect", fieldId: "PVTSSF_status", optionId: "todo" },
    });
    expect(invoke).toHaveBeenNthCalledWith(2, "github_change_personal_project_item", {
      number: 3,
      itemId: item.id,
      action: "archive",
    });
  });

  it("reconciles item updates and removes deleted projects from infinite caches", () => {
    const client = createClient();
    const listKey = githubQueryKeys.projects({ state: "open", query: "", sort: "updated" });
    const detailKey = githubQueryKeys.project({ number: 3, query: "", archived: false });
    client.setQueryData(listKey, {
      pages: [{ projects: [project] } as GitHubProjectPage],
      pageParams: [null],
    });
    client.setQueryData(detailKey, { pages: [detail], pageParams: [null] });
    const updated = {
      ...item,
      content: { ...item.content, title: "Projects shipped" },
    } as GitHubProjectItem;

    syncPersonalProjectItem(client, 3, updated);
    expect(
      client.getQueryData<{ pages: GitHubProjectDetail[] }>(detailKey)?.pages[0].items.items[0]
        .content
    ).toMatchObject({ title: "Projects shipped" });

    syncDeletedPersonalProject(client, 3);
    expect(client.getQueryData<{ pages: GitHubProjectPage[] }>(listKey)?.pages[0].projects).toEqual(
      []
    );
  });
});
