import type * as Data from "@/features/github/github-data";
import { workspaceFixture } from "./workspace-fixtures";
import { administrationFixture } from "./administration-fixtures";

export function createPagesActionFixtures(
  repositories: Data.GitHubRepository[],
  scenario: string | null,
  acceptWrites: boolean
) {
  const repository = repositories[0];
  if (!scenario || !repository) return () => undefined;
  const target = { owner: repository.owner, repository: repository.name };
  const settings = structuredClone(
    administrationFixture("github_get_personal_repository_settings", target, repositories, false)
  ) as Data.GitHubRepositorySettings;
  const workspace = structuredClone(
    administrationFixture("github_get_repository_pages", target, repositories, false)
  ) as Data.GitHubPagesWorkspace;
  const health = structuredClone(
    administrationFixture("github_get_repository_pages_health", target, repositories, false)
  ) as Data.GitHubPagesHealth;
  const siteTemplate = structuredClone(workspace.site!);
  workspace.isArchived = repository.isArchived;
  settings.repository.isArchived = repository.isArchived;
  let sequence = 0;
  if (scenario === "disabled") {
    workspace.site = undefined;
    workspace.builds = [];
  }
  if (workspace.site) {
    if (scenario === "workflow") {
      workspace.site.buildType = "workflow";
      workspace.site.source = undefined;
    }
    if (scenario === "certificate-pending") {
      workspace.site.httpsEnforced = false;
      workspace.site.certificate = { state: "pending", domains: ["docs.example.com"] };
      if (health.domain) health.domain.httpsEligible = false;
    }
    if (scenario === "health-pending") health.pending = true;
    if (scenario === "health-invalid" && health.domain) {
      Object.assign(health.domain, {
        valid: false,
        dnsResolves: false,
        respondsToHttps: false,
        httpsEligible: false,
        reason: "The custom domain does not resolve to this Pages site.",
        httpsError: "The certificate is not ready for this domain.",
      });
      workspace.site.httpsEnforced = false;
      workspace.site.certificate = { state: "pending", domains: ["docs.example.com"] };
    }
    if (scenario === "build-active") {
      workspace.site.status = "building";
      workspace.builds[0].status = "building";
    }
    if (scenario === "build-error") {
      workspace.site.status = "errored";
      workspace.builds[0].status = "errored";
      workspace.builds[0].error =
        "The documentation build could not resolve a relative link. 修复文档链接后可以重新构建。";
    }
  }
  return (command: string, args: Record<string, unknown>, empty = false): unknown => {
    if (command === "github_list_repositories" || command === "github_list_starred_repositories")
      return structuredClone(workspaceFixture(command, args, repositories, empty));
    if (args.owner !== repository.owner || args.repository !== repository.name) return undefined;
    if (command === "github_get_personal_repository_settings") return structuredClone(settings);
    if (command === "github_get_repository_pages") {
      const snapshot = structuredClone(workspace);
      if (empty) {
        snapshot.site = undefined;
        snapshot.builds = [];
      }
      return snapshot;
    }
    if (command === "github_get_repository_pages_health") return structuredClone(health);
    if (!acceptWrites) return undefined;
    if (command === "github_update_personal_repository_settings") {
      const update = args.update as Data.GitHubRepositorySettingsUpdate | undefined;
      if (!update?.confirmArchiveChange || typeof update.archived !== "boolean")
        throw new Error("This preview only accepts explicit archive changes");
      repository.isArchived =
        settings.repository.isArchived =
        workspace.isArchived =
          update.archived;
      return structuredClone(settings);
    }
    if (command !== "github_mutate_repository_pages") return undefined;
    if (workspace.isArchived) throw new Error("Archived preview repositories cannot change Pages");
    const mutation = args.mutation as Data.GitHubPagesMutation;
    if (mutation.action === "disable") {
      if (mutation.confirmation !== repository.fullName)
        throw new Error("Preview repository confirmation does not match");
      workspace.site = undefined;
      workspace.builds = [];
    } else if (mutation.action === "configure") {
      const value = mutation.configuration;
      if (value.buildType === "legacy" && (!value.branch || !value.sourcePath))
        throw new Error("Preview Pages source is required");
      const domainChanged = value.customDomain !== (workspace.site?.customDomain ?? null);
      workspace.site = {
        ...(workspace.site ?? siteTemplate),
        buildType: value.buildType,
        source:
          value.buildType === "legacy"
            ? { branch: value.branch!, path: value.sourcePath! }
            : undefined,
        customDomain: value.customDomain ?? undefined,
        httpsEnforced: value.httpsEnforced,
      };
      if (domainChanged && value.customDomain) {
        health.pending = true;
        health.domain = {
          host: value.customDomain,
          dnsResolves: false,
          proxied: false,
          valid: false,
          respondsToHttps: false,
          enforcesHttps: value.httpsEnforced,
          httpsEligible: false,
        };
        health.alternateDomain = undefined;
        workspace.site.certificate = { state: "pending", domains: [value.customDomain] };
      }
    } else if (mutation.action === "requestBuild") {
      if (workspace.site?.buildType !== "legacy")
        throw new Error("Preview Pages is not using branch builds");
      workspace.site.status = "building";
      workspace.builds.unshift({
        status: "queued",
        createdAt: `2026-09-09T08:${String(++sequence).padStart(2, "0")}:00Z`,
        pusher: "harbor-preview",
      });
    } else throw new Error("Unknown preview Pages mutation");
    return structuredClone(workspace);
  };
}
