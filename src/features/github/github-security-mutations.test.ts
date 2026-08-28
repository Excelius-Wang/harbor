import { QueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  GitHubDependabotAlertDetail,
  GitHubRepositoryIdentity,
  GitHubSecurityAlertPage,
} from "./github-data";
import { notificationCanOpenInApp } from "./github-notification-target";
import {
  codeScanningInstancesQueryOptions,
  githubQueryKeys,
  secretScanningLocationsQueryOptions,
  securityAlertQueryOptions,
  securityAlertsQueryOptions,
} from "./github-queries";
import {
  reconcileGitHubSecurityAlert,
  updateGitHubSecurityAlert,
} from "./github-security-mutations";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

const repository: GitHubRepositoryIdentity = {
  owner: "octocat",
  name: "hello-world",
};

const detail: GitHubDependabotAlertDetail = {
  kind: "dependabot",
  alert: {
    kind: "dependabot",
    number: 7,
    state: "dismissed",
    severity: "high",
    title: "Upgrade the vulnerable dependency",
    packageName: "semver",
    ecosystem: "npm",
    manifestPath: "pnpm-lock.yaml",
    url: "https://github.com/octocat/hello-world/security/dependabot/7",
    createdAt: "2026-08-01T00:00:00Z",
    updatedAt: "2026-08-02T00:00:00Z",
    assignees: [],
  },
  description: "Upgrade semver.",
  ghsaId: "GHSA-xxxx-yyyy-zzzz",
  vulnerableVersionRange: "< 7.7.0",
  firstPatchedVersion: "7.7.0",
  cwes: [],
  references: [],
  publishedAt: "2026-08-01T00:00:00Z",
  dismissedReason: "tolerable_risk",
};

function createClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Number.POSITIVE_INFINITY } },
  });
}

describe("GitHub security alerts", () => {
  beforeEach(() => {
    vi.mocked(invoke).mockReset();
  });

  it("keys every list filter and invokes the focused security command", async () => {
    const client = createClient();
    vi.mocked(invoke).mockResolvedValueOnce({
      alerts: [],
      page: 2,
      hasPrevious: true,
      hasMore: false,
    });
    const options = securityAlertsQueryOptions({
      owner: repository.owner,
      repository: repository.name,
      kind: "codeScanning",
      state: "closed",
      severity: "high",
      sort: "updated",
      page: 2,
    });

    await client.fetchQuery(options);

    expect(options.queryKey).toEqual([
      "github",
      "repository",
      "octocat",
      "hello-world",
      "security",
      "codeScanning",
      "closed",
      "high",
      "updated",
      2,
    ]);
    expect(invoke).toHaveBeenCalledWith("github_list_repository_security_alerts", {
      owner: "octocat",
      repository: "hello-world",
      kind: "codeScanning",
      alertState: "closed",
      severity: "high",
      sort: "updated",
      page: 2,
    });
  });

  it("keeps detail and family evidence in independent caches", async () => {
    const client = createClient();
    vi.mocked(invoke)
      .mockResolvedValueOnce({ kind: "codeScanning", alert: { number: 42 } })
      .mockResolvedValueOnce({ instances: [], page: 3, hasPrevious: true, hasMore: false })
      .mockResolvedValueOnce({ locations: [], page: 4, hasPrevious: true, hasMore: false });

    await client.fetchQuery(
      securityAlertQueryOptions({
        owner: repository.owner,
        repository: repository.name,
        kind: "codeScanning",
        alertNumber: 42,
      })
    );
    await client.fetchQuery(
      codeScanningInstancesQueryOptions({
        owner: repository.owner,
        repository: repository.name,
        alertNumber: 42,
        page: 3,
      })
    );
    await client.fetchQuery(
      secretScanningLocationsQueryOptions({
        owner: repository.owner,
        repository: repository.name,
        alertNumber: 9,
        page: 4,
      })
    );

    expect(invoke).toHaveBeenNthCalledWith(1, "github_get_repository_security_alert", {
      owner: "octocat",
      repository: "hello-world",
      kind: "codeScanning",
      alertNumber: 42,
    });
    expect(invoke).toHaveBeenNthCalledWith(2, "github_list_repository_code_scanning_instances", {
      owner: "octocat",
      repository: "hello-world",
      alertNumber: 42,
      page: 3,
    });
    expect(invoke).toHaveBeenNthCalledWith(3, "github_list_repository_secret_scanning_locations", {
      owner: "octocat",
      repository: "hello-world",
      alertNumber: 9,
      page: 4,
    });
  });

  it("reconciles a closed alert out of open caches and into matching closed caches", () => {
    const client = createClient();
    const openKey = githubQueryKeys.securityAlerts({
      owner: repository.owner,
      repository: repository.name,
      kind: "dependabot",
      state: "open",
      severity: "all",
      sort: "updated",
      page: 1,
    });
    const closedKey = githubQueryKeys.securityAlerts({
      owner: repository.owner,
      repository: repository.name,
      kind: "dependabot",
      state: "closed",
      severity: "high",
      sort: "updated",
      page: 1,
    });
    const openAlert = { ...detail.alert, state: "open" };
    const page: GitHubSecurityAlertPage = {
      alerts: [openAlert],
      page: 1,
      hasPrevious: false,
      hasMore: false,
    };
    client.setQueryData(openKey, page);
    client.setQueryData(closedKey, { ...page, alerts: [] });

    reconcileGitHubSecurityAlert(client, repository, detail);

    expect(client.getQueryData<GitHubSecurityAlertPage>(openKey)?.alerts).toEqual([]);
    expect(client.getQueryData<GitHubSecurityAlertPage>(closedKey)?.alerts).toEqual([detail.alert]);
  });

  it("sends family-specific state updates and routes stable security notifications natively", async () => {
    vi.mocked(invoke).mockResolvedValueOnce(detail);
    await updateGitHubSecurityAlert({
      ...repository,
      alertNumber: 7,
      mutation: {
        kind: "dependabot",
        state: "closed",
        reason: "tolerableRisk",
        comment: "The vulnerable path is unreachable.",
      },
    });

    expect(invoke).toHaveBeenCalledWith("github_update_repository_security_alert", {
      owner: "octocat",
      repository: "hello-world",
      alertNumber: 7,
      mutation: {
        kind: "dependabot",
        state: "closed",
        reason: "tolerableRisk",
        comment: "The vulnerable path is unreachable.",
      },
    });

    const notification = {
      id: 1,
      repository: {
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
      },
      subject: {
        title: "Upgrade semver",
        kind: "dependabotAlert" as const,
        number: 7,
        url: detail.alert.url,
      },
      reason: "security_alert",
      unread: true,
      updatedAt: "2026-08-02T00:00:00Z",
    };
    expect(notificationCanOpenInApp(notification)).toBe(true);
    expect(
      notificationCanOpenInApp({
        ...notification,
        subject: { ...notification.subject, number: undefined },
      })
    ).toBe(false);
  });
});
