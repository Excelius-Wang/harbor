import type { QueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import type {
  GitHubFileDownloadResult,
  GitHubRelease,
  GitHubReleaseArchiveFormat,
  GitHubReleaseAsset,
  GitHubReleaseMutationInput,
  GitHubReleasePage,
} from "./github-data";
import { githubQueryKeys } from "./github-queries";

export type GitHubReleaseTarget = {
  owner: string;
  repository: string;
  releaseId: number;
};

export type GitHubReleaseRepositoryTarget = Pick<GitHubReleaseTarget, "owner" | "repository">;

export type GitHubReleaseAssetDownloadTarget = GitHubReleaseTarget & {
  assetId: number;
  assetName: string;
};

export type GitHubReleaseArchiveDownloadTarget = GitHubReleaseTarget & {
  tagName: string;
  archiveFormat: GitHubReleaseArchiveFormat;
};

export function downloadRepositoryReleaseAsset(target: GitHubReleaseAssetDownloadTarget) {
  return invoke<GitHubFileDownloadResult>("github_download_repository_release_asset", target);
}

export function downloadRepositoryReleaseArchive(target: GitHubReleaseArchiveDownloadTarget) {
  return invoke<GitHubFileDownloadResult>("github_download_repository_release_archive", target);
}

export function createRepositoryRelease(
  target: GitHubReleaseRepositoryTarget,
  input: GitHubReleaseMutationInput
) {
  return invoke<GitHubRelease>("github_create_repository_release", {
    owner: target.owner,
    repository: target.repository,
    input,
  });
}

export function updateRepositoryRelease(
  target: GitHubReleaseTarget,
  input: GitHubReleaseMutationInput
) {
  return invoke<GitHubRelease>("github_update_repository_release", { ...target, input });
}

export function deleteRepositoryRelease(target: GitHubReleaseTarget) {
  return invoke<void>("github_delete_repository_release", target);
}

export function uploadRepositoryReleaseAsset(target: GitHubReleaseTarget) {
  return invoke<GitHubReleaseAsset | null>("github_upload_repository_release_asset", target);
}

export function deleteRepositoryReleaseAsset(target: GitHubReleaseTarget, assetId: number) {
  return invoke<void>("github_delete_repository_release_asset", { ...target, assetId });
}

export function primeRepositoryRelease(
  queryClient: QueryClient,
  target: GitHubReleaseTarget,
  release: GitHubRelease
) {
  queryClient.setQueryData(githubQueryKeys.release(target), release);
}

function updateReleaseCaches(
  queryClient: QueryClient,
  target: GitHubReleaseTarget,
  update: (release: GitHubRelease) => GitHubRelease
) {
  queryClient.setQueryData<GitHubRelease>(githubQueryKeys.release(target), (release) =>
    release ? update(release) : release
  );
  queryClient.setQueriesData<GitHubReleasePage>(
    { queryKey: githubQueryKeys.releasesRoot(target) },
    (page) =>
      page
        ? {
            ...page,
            releases: page.releases.map((release) =>
              release.id === target.releaseId ? update(release) : release
            ),
          }
        : page
  );
}

export function syncCreatedRelease(
  queryClient: QueryClient,
  target: GitHubReleaseRepositoryTarget,
  release: GitHubRelease
) {
  queryClient.setQueryData(githubQueryKeys.release({ ...target, releaseId: release.id }), release);
}

export function syncUpdatedRelease(
  queryClient: QueryClient,
  target: GitHubReleaseTarget,
  release: GitHubRelease
) {
  updateReleaseCaches(queryClient, target, () => release);
}

export function syncUploadedReleaseAsset(
  queryClient: QueryClient,
  target: GitHubReleaseTarget,
  asset: GitHubReleaseAsset
) {
  updateReleaseCaches(queryClient, target, (release) => ({
    ...release,
    assets: release.assets.some((existing) => existing.id === asset.id)
      ? release.assets.map((existing) => (existing.id === asset.id ? asset : existing))
      : [...release.assets, asset],
  }));
}

export function syncDeletedReleaseAsset(
  queryClient: QueryClient,
  target: GitHubReleaseTarget,
  assetId: number
) {
  updateReleaseCaches(queryClient, target, (release) => ({
    ...release,
    assets: release.assets.filter((asset) => asset.id !== assetId),
  }));
}

export function syncDeletedRelease(queryClient: QueryClient, target: GitHubReleaseTarget) {
  queryClient.removeQueries({ queryKey: githubQueryKeys.release(target), exact: true });
  queryClient.setQueriesData<GitHubReleasePage>(
    { queryKey: githubQueryKeys.releasesRoot(target) },
    (page) =>
      page
        ? {
            ...page,
            releases: page.releases.filter((release) => release.id !== target.releaseId),
          }
        : page
  );
}

export async function invalidateRepositoryReleases(
  queryClient: QueryClient,
  target: GitHubReleaseRepositoryTarget,
  releaseId?: number
) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: githubQueryKeys.releasesRoot(target) }),
    releaseId === undefined
      ? Promise.resolve()
      : queryClient.invalidateQueries({
          queryKey: githubQueryKeys.release({ ...target, releaseId }),
          exact: true,
        }),
  ]);
}
