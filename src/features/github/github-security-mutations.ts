import type { QueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import type {
  GitHubRepositoryIdentity,
  GitHubSecurityAlertDetail,
  GitHubSecurityAlertKind,
  GitHubSecurityAlertMutation,
  GitHubSecurityAlertPage,
  GitHubSecurityAlertSeverityFilter,
  GitHubSecurityAlertStateFilter,
  GitHubSecurityAlertSummary,
} from "./github-data";
import { githubQueryKeys } from "./github-queries";

export type GitHubSecurityAlertMutationTarget = GitHubRepositoryIdentity & {
  alertNumber: number;
  mutation: GitHubSecurityAlertMutation;
};

export function updateGitHubSecurityAlert(target: GitHubSecurityAlertMutationTarget) {
  return invoke<GitHubSecurityAlertDetail>("github_update_repository_security_alert", {
    owner: target.owner,
    repository: target.name,
    alertNumber: target.alertNumber,
    mutation: target.mutation,
  });
}

export function reconcileGitHubSecurityAlert(
  queryClient: QueryClient,
  repository: GitHubRepositoryIdentity,
  detail: GitHubSecurityAlertDetail
) {
  const target = {
    owner: repository.owner,
    repository: repository.name,
    kind: detail.kind,
    alertNumber: detail.alert.number,
  };
  queryClient.setQueryData(githubQueryKeys.securityAlert(target), detail);

  for (const [queryKey, page] of queryClient.getQueriesData<GitHubSecurityAlertPage>({
    queryKey: githubQueryKeys.securityAlertsRoot({
      owner: repository.owner,
      repository: repository.name,
    }),
  })) {
    if (!page) continue;
    const kind = queryKey[5] as GitHubSecurityAlertKind;
    const state = queryKey[6] as GitHubSecurityAlertStateFilter;
    const severity = queryKey[7] as GitHubSecurityAlertSeverityFilter;
    const withoutCurrent = page.alerts.filter(
      (alert) => !(alert.kind === detail.kind && alert.number === detail.alert.number)
    );
    const nextAlerts =
      kind === detail.kind && alertMatchesFilters(detail.alert, state, severity)
        ? [detail.alert, ...withoutCurrent]
        : withoutCurrent;
    queryClient.setQueryData(queryKey, { ...page, alerts: nextAlerts });
  }
}

export function invalidateGitHubSecurityAlert(
  queryClient: QueryClient,
  repository: GitHubRepositoryIdentity,
  kind: GitHubSecurityAlertKind,
  alertNumber: number
) {
  const owner = repository.owner;
  const repositoryName = repository.name;
  return Promise.all([
    queryClient.invalidateQueries({
      queryKey: githubQueryKeys.securityAlertsRoot({ owner, repository: repositoryName }),
    }),
    queryClient.invalidateQueries({
      queryKey: githubQueryKeys.securityAlert({
        owner,
        repository: repositoryName,
        kind,
        alertNumber,
      }),
    }),
    kind === "codeScanning"
      ? queryClient.invalidateQueries({
          queryKey: githubQueryKeys.codeScanningInstancesRoot({
            owner,
            repository: repositoryName,
            alertNumber,
          }),
        })
      : Promise.resolve(),
    kind === "secretScanning"
      ? queryClient.invalidateQueries({
          queryKey: githubQueryKeys.secretScanningLocationsRoot({
            owner,
            repository: repositoryName,
            alertNumber,
          }),
        })
      : Promise.resolve(),
  ]);
}

function alertMatchesFilters(
  alert: GitHubSecurityAlertSummary,
  state: GitHubSecurityAlertStateFilter,
  severity: GitHubSecurityAlertSeverityFilter
) {
  const stateMatches =
    state === "all" || (state === "open" ? alert.state === "open" : alert.state !== "open");
  const severityMatches =
    severity === "all" ||
    alert.kind === "secretScanning" ||
    alert.severity.toLocaleLowerCase() === severity;
  return stateMatches && severityMatches;
}
