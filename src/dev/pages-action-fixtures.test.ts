import { describe, expect, it } from "vitest";
import type {
  GitHubPagesWorkspace,
  GitHubRepository,
  GitHubRepositorySettings,
} from "@/features/github/github-data";
import { createPagesActionFixtures } from "./pages-action-fixtures";
function repository(isArchived = false) {
  return {
    id: 1,
    owner: "preview",
    name: "harbor",
    fullName: "preview/harbor",
    url: "https://github.com/preview/harbor",
    isArchived,
  } as GitHubRepository;
}
const target = { owner: "preview", repository: "harbor" };
describe("Pages preview write boundaries", () => {
  it("requires explicit preview write authorization and the exact target", () => {
    const fixture = createPagesActionFixtures([repository()], "standard", false);
    expect(
      fixture("github_mutate_repository_pages", { ...target, mutation: { action: "requestBuild" } })
    ).toBeUndefined();
    expect(
      fixture("github_get_repository_pages", { ...target, repository: "other" })
    ).toBeUndefined();
  });
  it("blocks archived writes and reconciles unarchive across settings and Pages", () => {
    const fixture = createPagesActionFixtures([repository(true)], "archived", true);
    expect(() =>
      fixture("github_mutate_repository_pages", { ...target, mutation: { action: "requestBuild" } })
    ).toThrow("Archived preview");
    const settings = fixture("github_update_personal_repository_settings", {
      ...target,
      update: { confirmArchiveChange: true, archived: false },
    }) as GitHubRepositorySettings;
    expect(settings.repository.isArchived).toBe(false);
    expect(
      (fixture("github_get_repository_pages", target) as GitHubPagesWorkspace).isArchived
    ).toBe(false);
  });
  it("checks disable confirmation and clears the site and history", () => {
    const fixture = createPagesActionFixtures([repository()], "standard", true);
    expect(() =>
      fixture("github_mutate_repository_pages", {
        ...target,
        mutation: { action: "disable", confirmation: "other" },
      })
    ).toThrow("confirmation does not match");
    const result = fixture("github_mutate_repository_pages", {
      ...target,
      mutation: { action: "disable", confirmation: "preview/harbor" },
    }) as GitHubPagesWorkspace;
    expect(result.site).toBeUndefined();
    expect(result.builds).toHaveLength(0);
    expect(
      (fixture("github_get_repository_pages", target) as GitHubPagesWorkspace).site
    ).toBeUndefined();
  });
  it("isolates snapshots and rejects branch builds for an Actions site", () => {
    const fixture = createPagesActionFixtures([repository()], "workflow", true);
    const result = fixture("github_get_repository_pages", target) as GitHubPagesWorkspace;
    result.site!.buildType = "legacy";
    expect(() =>
      fixture("github_mutate_repository_pages", { ...target, mutation: { action: "requestBuild" } })
    ).toThrow("not using branch builds");
  });
});
