import { QueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GitHubRelease } from "./github-data";
import {
  createRepositoryRelease,
  deleteRepositoryRelease,
  deleteRepositoryReleaseAsset,
  downloadRepositoryReleaseArchive,
  downloadRepositoryReleaseAsset,
  primeRepositoryRelease,
  syncDeletedRelease,
  syncDeletedReleaseAsset,
  syncUpdatedRelease,
  syncUploadedReleaseAsset,
  updateRepositoryRelease,
  uploadRepositoryReleaseAsset,
} from "./github-release-mutations";
import { githubQueryKeys } from "./github-queries";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

const target = {
  owner: "octocat",
  repository: "hello-world",
  releaseId: 88,
};

const release: GitHubRelease = {
  id: 88,
  reactionSubject: { id: "RE_kwDOA", kind: "release" },
  tagName: "v1.0.0",
  targetCommitish: "main",
  url: "https://github.com/octocat/hello-world/releases/tag/v1.0.0",
  draft: false,
  prerelease: false,
  immutable: true,
  hasZipball: true,
  hasTarball: true,
  assets: [
    {
      id: 96,
      name: "harbor.dmg",
      state: "uploaded",
      contentType: "application/octet-stream",
      size: 12,
      downloadCount: 0,
      createdAt: "2026-08-28T08:00:00Z",
      updatedAt: "2026-08-28T08:00:00Z",
    },
  ],
};

const input = {
  tagName: "v1.0.0",
  targetCommitish: "main",
  name: "Harbor 1.0",
  body: "A focused release.",
  draft: false,
  prerelease: false,
};

describe("GitHub Release downloads", () => {
  beforeEach(() => {
    vi.mocked(invoke).mockReset();
    vi.mocked(invoke).mockResolvedValue({ saved: true, path: "/tmp/release" });
  });

  it("invokes native Save As commands with stable release and asset identities", async () => {
    await downloadRepositoryReleaseAsset({
      ...target,
      assetId: 96,
      assetName: "harbor.dmg",
    });
    await downloadRepositoryReleaseArchive({
      ...target,
      tagName: "v1.0.0",
      archiveFormat: "tarGz",
    });

    expect(invoke).toHaveBeenNthCalledWith(1, "github_download_repository_release_asset", {
      ...target,
      assetId: 96,
      assetName: "harbor.dmg",
    });
    expect(invoke).toHaveBeenNthCalledWith(2, "github_download_repository_release_archive", {
      ...target,
      tagName: "v1.0.0",
      archiveFormat: "tarGz",
    });
  });

  it("primes stable release detail from a complete list record", () => {
    const queryClient = new QueryClient();

    primeRepositoryRelease(queryClient, target, release);

    expect(queryClient.getQueryData(githubQueryKeys.release(target))).toEqual(release);
  });

  it("invokes native release lifecycle commands with nested validated content", async () => {
    await createRepositoryRelease(target, input);
    await updateRepositoryRelease(target, input);
    await deleteRepositoryRelease(target);
    await uploadRepositoryReleaseAsset(target);
    await deleteRepositoryReleaseAsset(target, 96);

    expect(invoke).toHaveBeenNthCalledWith(1, "github_create_repository_release", {
      owner: target.owner,
      repository: target.repository,
      input,
    });
    expect(invoke).toHaveBeenNthCalledWith(2, "github_update_repository_release", {
      ...target,
      input,
    });
    expect(invoke).toHaveBeenNthCalledWith(3, "github_delete_repository_release", target);
    expect(invoke).toHaveBeenNthCalledWith(4, "github_upload_repository_release_asset", target);
    expect(invoke).toHaveBeenNthCalledWith(5, "github_delete_repository_release_asset", {
      ...target,
      assetId: 96,
    });
  });

  it("synchronizes updated releases and asset membership across detail and list caches", () => {
    const queryClient = new QueryClient();
    const listKey = githubQueryKeys.releases({ ...target, page: 1 });
    queryClient.setQueryData(githubQueryKeys.release(target), release);
    queryClient.setQueryData(listKey, {
      releases: [release],
      page: 1,
      hasPrevious: false,
      hasMore: false,
    });

    const updated = { ...release, name: "Harbor 1.0.1" };
    syncUpdatedRelease(queryClient, target, updated);
    syncUploadedReleaseAsset(queryClient, target, {
      ...release.assets[0],
      id: 97,
      name: "harbor.zip",
    });
    syncDeletedReleaseAsset(queryClient, target, 96);

    expect(queryClient.getQueryData<GitHubRelease>(githubQueryKeys.release(target))).toMatchObject({
      name: "Harbor 1.0.1",
      assets: [{ id: 97, name: "harbor.zip" }],
    });
    expect(
      queryClient.getQueryData<{ releases: GitHubRelease[] }>(listKey)?.releases[0]
    ).toMatchObject({
      name: "Harbor 1.0.1",
      assets: [{ id: 97, name: "harbor.zip" }],
    });

    syncDeletedRelease(queryClient, target);
    expect(queryClient.getQueryData(githubQueryKeys.release(target))).toBeUndefined();
    expect(queryClient.getQueryData<{ releases: GitHubRelease[] }>(listKey)?.releases).toEqual([]);
  });
});
