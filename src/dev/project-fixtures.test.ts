import { expect, it } from "vitest";
import type * as Data from "@/features/github/github-data";
import { createProjectFixtures } from "./project-fixtures";

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
const target = { number: 1 };
function fixture(scenario = "fields", acceptWrites = true) {
  return createProjectFixtures([repository], scenario, acceptWrites);
}

it("round-trips all editable field types and clear without mutating previous snapshots", () => {
  const invoke = fixture();
  const before = invoke("github_get_personal_project", target, false) as Data.GitHubProjectDetail;
  const itemId = before.items.items[0].id;
  const updates: Data.GitHubProjectItemUpdate[] = [
    { kind: "text", fieldId: "notes", text: "New notes\nNext line" },
    { kind: "number", fieldId: "effort", number: 2.5 },
    { kind: "date", fieldId: "date", date: "2026-10-01" },
    { kind: "singleSelect", fieldId: "status", optionId: "progress" },
    { kind: "multiSelect", fieldId: "tags", optionIds: ["keyboard", "reading"] },
    { kind: "iteration", fieldId: "cycle", iterationId: "cycle-completed" },
  ];
  for (const update of updates)
    invoke("github_update_personal_project_item", { ...target, itemId, update }, false);
  const after = invoke("github_get_personal_project", target, false) as Data.GitHubProjectDetail;
  expect(after.items.items[0].fieldValues).toEqual([
    { kind: "text", fieldId: "notes", text: "New notes\nNext line" },
    { kind: "number", fieldId: "effort", number: 2.5 },
    { kind: "date", fieldId: "date", date: "2026-10-01" },
    {
      kind: "singleSelect",
      fieldId: "status",
      optionId: "progress",
      name: "In progress",
      color: "BLUE",
    },
    {
      kind: "multiSelect",
      fieldId: "tags",
      options: after.fields.find((field) => field.id === "tags")!.options,
    },
    {
      kind: "iteration",
      fieldId: "cycle",
      iterationId: "cycle-completed",
      title: "August review and feedback",
      startDate: "2026-08-01",
      duration: 14,
    },
  ]);
  expect(before.items.items[0].fieldValues.find((value) => value.kind === "number")).toMatchObject({
    number: 0,
  });
  invoke(
    "github_update_personal_project_item",
    { ...target, itemId, update: { kind: "clearField", fieldId: "notes" } },
    false
  );
  expect(
    (
      invoke("github_get_personal_project", target, false) as Data.GitHubProjectDetail
    ).items.items[0].fieldValues.some((value) => value.fieldId === "notes")
  ).toBe(false);
});

it("reconciles draft and item lifecycle actions with active/archived reads", () => {
  const invoke = fixture();
  const item = invoke(
    "github_add_personal_project_item",
    { ...target, addition: { kind: "draftIssue", title: "New draft", body: "Body" } },
    false
  ) as Data.GitHubProjectItem;
  invoke(
    "github_update_personal_project_item",
    {
      ...target,
      itemId: item.id,
      update: { kind: "draftIssue", title: "Edited draft", body: "Edited body" },
    },
    false
  );
  invoke(
    "github_change_personal_project_item",
    { ...target, itemId: item.id, action: "archive" },
    false
  );
  const archived = invoke(
    "github_get_personal_project",
    { ...target, archived: true },
    false
  ) as Data.GitHubProjectDetail;
  expect(archived.items.items[0]).toMatchObject({
    id: item.id,
    archived: true,
    content: { title: "Edited draft" },
  });
  expect(
    (
      invoke("github_get_personal_project", target, false) as Data.GitHubProjectDetail
    ).items.items.some((current) => current.id === item.id)
  ).toBe(false);
  invoke(
    "github_change_personal_project_item",
    { ...target, itemId: item.id, action: "unarchive" },
    false
  );
  expect(
    (invoke("github_get_personal_project", target, false) as Data.GitHubProjectDetail).items.items
  ).toHaveLength(5);
  invoke(
    "github_change_personal_project_item",
    { ...target, itemId: item.id, action: "delete" },
    false
  );
  expect(
    (invoke("github_get_personal_project", target, false) as Data.GitHubProjectDetail).project
      .itemCount
  ).toBe(4);
  expect(item.content).toMatchObject({ title: "New draft" });
});

it("supports creation after an empty Project list and reconciles settings/list deletion", () => {
  const invoke = fixture();
  const before = invoke(
    "github_list_personal_projects",
    { projectState: "all" },
    false
  ) as Data.GitHubProjectPage;
  for (const project of before.projects)
    invoke("github_delete_personal_project", { number: project.number }, false);
  expect(
    (invoke("github_list_personal_projects", {}, false) as Data.GitHubProjectPage).projects
  ).toEqual([]);
  const created = invoke(
    "github_create_personal_project",
    { title: "New roadmap" },
    false
  ) as Data.GitHubProjectSummary;
  expect(created).toMatchObject({
    title: "New roadmap",
    itemCount: 0,
    public: true,
    viewerCanUpdate: true,
  });
  const update: Data.GitHubProjectUpdate = {
    title: "Closed roadmap",
    shortDescription: "Notes",
    readme: "Readme",
    public: false,
    closed: true,
  };
  invoke("github_update_personal_project", { number: created.number, update }, false);
  expect(
    (
      invoke(
        "github_list_personal_projects",
        { projectState: "closed" },
        false
      ) as Data.GitHubProjectPage
    ).projects[0]
  ).toMatchObject({ title: update.title, public: false, closed: true });
  expect(
    (
      invoke(
        "github_get_personal_project",
        { number: created.number },
        false
      ) as Data.GitHubProjectDetail
    ).readme
  ).toBe("Readme");
  expect(before.projects).toHaveLength(4);
});

it("requires write opt-in, enforces read-only access and keeps Project item identities separate", () => {
  expect(fixture("fields", false)("github_delete_personal_project", target, false)).toBeUndefined();
  expect(() => fixture("readonly")("github_delete_personal_project", target, false)).toThrowError();
  const invoke = fixture();
  const first = invoke("github_get_personal_project", target, false) as Data.GitHubProjectDetail;
  const second = invoke(
    "github_get_personal_project",
    { number: 2 },
    false
  ) as Data.GitHubProjectDetail;
  expect(first.items.items[0].id).not.toBe(second.items.items[0].id);
  expect(
    invoke("github_delete_repository_issue", { ...target, issueNumber: 1 }, false)
  ).toBeUndefined();
});
