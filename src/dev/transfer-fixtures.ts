import type * as Data from "@/features/github/github-data";
import { repositoryFixture } from "./repository-fixtures";

export function createTransferFixtures(
  repositories: Data.GitHubRepository[],
  scenario: string | null,
  acceptWrites: boolean
) {
  const repository = repositories[0];
  if (!scenario || !repository) return () => undefined;
  const target = { owner: repository.owner, repository: repository.name };
  const page = structuredClone(
    repositoryFixture("github_list_repository_releases", target, repositories, false)
  ) as Data.GitHubReleasePage;
  const releases = new Map(page.releases.map((release) => [release.id, release]));
  let nextAsset = 1000;
  for (const release of releases.values()) {
    if (scenario === "immutable") release.immutable = true;
    if (scenario === "unavailable") {
      release.assets[0].state = "starter";
      release.hasZipball = false;
      release.hasTarball = false;
    }
    if (scenario === "long")
      release.assets[0].name =
        "Repolane-workspace-preview-with-debug-symbols-and-a-deliberately-long-release-asset-name-面向桌面验收的文件-aarch64.zip";
  }
  return (command: string, args: Record<string, unknown>, empty = false): unknown => {
    if (args.owner !== repository.owner || args.repository !== repository.name) return undefined;
    if (command === "github_list_repository_releases")
      return structuredClone({ ...page, releases: empty ? [] : [...releases.values()] });
    if (command === "github_get_repository_release") {
      const release = releases.get(Number(args.releaseId));
      if (!release) throw new Error("Unknown preview release");
      return structuredClone({ ...release, assets: empty ? [] : release.assets });
    }
    const transfers = [
      "github_download_repository_release_asset",
      "github_download_repository_release_archive",
      "github_upload_repository_release_asset",
      "github_download_repository_file",
    ];
    if (!acceptWrites || !transfers.includes(command)) return undefined;
    if (scenario === "permission")
      throw { code: "githubPermission", message: "This controlled transfer is not permitted." };
    if (command === "github_download_repository_file") {
      if (typeof args.path !== "string" || !args.path || typeof args.reference !== "string")
        throw new Error("Unknown preview file target");
      return {
        saved: scenario !== "cancelled",
        path: scenario === "cancelled" ? null : "/tmp/Repolane-preview-README.md",
      } satisfies Data.GitHubFileDownloadResult;
    }
    const release = releases.get(Number(args.releaseId));
    if (!release) throw new Error("Unknown preview release target");
    if (command === "github_upload_repository_release_asset") {
      if (release.immutable) throw new Error("Immutable preview releases cannot accept assets");
      if (scenario === "cancelled") return null;
      const asset: Data.GitHubReleaseAsset = {
        id: nextAsset++,
        name: "Repolane-preview-symbols.zip",
        state: "uploaded",
        contentType: "application/zip",
        size: 512000,
        downloadCount: 0,
        createdAt: "2026-09-09T09:00:00Z",
        updatedAt: "2026-09-09T09:00:00Z",
        uploader: "harbor-preview",
      };
      release.assets.push(asset);
      return structuredClone(asset);
    }
    let filename: string;
    if (command === "github_download_repository_release_asset") {
      const asset = release.assets.find(
        (item) => item.id === args.assetId && item.name === args.assetName
      );
      if (!asset || asset.state !== "uploaded")
        throw new Error("Preview release asset is not downloadable");
      filename = asset.name;
    } else {
      if (
        args.tagName !== release.tagName ||
        !["zip", "tarGz"].includes(String(args.archiveFormat))
      )
        throw new Error("Unknown preview archive target");
      if (args.archiveFormat === "zip" ? !release.hasZipball : !release.hasTarball)
        throw new Error("Preview source archive is unavailable");
      filename = `Repolane-${release.tagName}.${args.archiveFormat === "zip" ? "zip" : "tar.gz"}`;
    }
    return {
      saved: scenario !== "cancelled",
      path: scenario === "cancelled" ? null : `/tmp/${filename}`,
    } satisfies Data.GitHubFileDownloadResult;
  };
}
