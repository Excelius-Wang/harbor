import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import type { GitHubPullRequest, GitHubPullRequestRepository } from "./github-data";
import { GitHubItemMetadataSections } from "./github-issue-metadata";
import {
  invalidateRepositoryPullRequest,
  syncUpdatedPullRequest,
  updateRepositoryPullRequestMetadata,
  type GitHubPullRequestMutationTarget,
} from "./github-pull-request-mutations";

export function GitHubPullRequestMetadata({
  repository,
  pullRequest,
}: {
  repository: GitHubPullRequestRepository;
  pullRequest: GitHubPullRequest;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const target: GitHubPullRequestMutationTarget = {
    owner: repository.owner,
    repository: repository.name,
    pullRequestNumber: pullRequest.number,
  };

  return (
    <GitHubItemMetadataSections
      repository={repository}
      subject={pullRequest}
      dialogTitle={t("workspace.repositories.editPullRequestMetadata")}
      dialogDescription={t("workspace.repositories.editPullRequestMetadataDescription", {
        number: pullRequest.number,
      })}
      errorTitle={t("workspace.repositories.updatePullRequestMetadataFailed")}
      successMessage={t("workspace.repositories.pullRequestMetadataUpdated")}
      permissionMessage={t("workspace.repositories.pullRequestWritePermissionDenied")}
      updateMetadata={(value) => updateRepositoryPullRequestMetadata(target, value)}
      onUpdated={(updatedPullRequest) => {
        syncUpdatedPullRequest(queryClient, target, updatedPullRequest);
        void invalidateRepositoryPullRequest(queryClient, target);
      }}
    />
  );
}
