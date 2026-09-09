import { describe, expect, it } from "vitest";
import type {
  GitHubRelease,
  GitHubReleaseAsset,
  GitHubRepository,
} from "@/features/github/github-data";
import { createTransferFixtures } from "./transfer-fixtures";
const repositories = [
  {
    owner: "harbor-preview",
    name: "harbor",
    fullName: "harbor-preview/harbor",
    url: "https://github.com/harbor-preview/harbor",
  },
] as GitHubRepository[];
const target = { owner: "harbor-preview", repository: "harbor", releaseId: 1 };
describe("controlled transfer boundaries", () => {
  it("requires opt-in writes and exact repository targets", () => {
    const fixture = createTransferFixtures(repositories, "standard", false);
    expect(fixture("github_upload_repository_release_asset", target)).toBeUndefined();
    expect(fixture("github_get_repository_release", { ...target, owner: "other" })).toBeUndefined();
  });
  it("returns cancellation without adding an asset", () => {
    const fixture = createTransferFixtures(repositories, "cancelled", true);
    expect(
      fixture("github_download_repository_release_archive", {
        ...target,
        tagName: "v1.4.0",
        archiveFormat: "zip",
      })
    ).toEqual({ saved: false, path: null });
    expect(fixture("github_upload_repository_release_asset", target)).toBeNull();
    expect((fixture("github_get_repository_release", target) as GitHubRelease).assets).toHaveLength(
      1
    );
  });
  it("isolates upload results and changes only the target release", () => {
    const fixture = createTransferFixtures(repositories, "standard", true);
    const asset = fixture("github_upload_repository_release_asset", target) as GitHubReleaseAsset;
    asset.name = "outside mutation";
    const release = fixture("github_get_repository_release", target) as GitHubRelease;
    expect(release.assets).toHaveLength(2);
    expect(release.assets[1].name).toBe("Repolane-preview-symbols.zip");
    expect(
      (fixture("github_get_repository_release", { ...target, releaseId: 2 }) as GitHubRelease)
        .assets
    ).toHaveLength(1);
  });
  it("rejects unavailable assets and incorrect archive identities", () => {
    const fixture = createTransferFixtures(repositories, "unavailable", true);
    const release = fixture("github_get_repository_release", target) as GitHubRelease;
    expect(() =>
      fixture("github_download_repository_release_asset", {
        ...target,
        assetId: release.assets[0].id,
        assetName: release.assets[0].name,
      })
    ).toThrow("not downloadable");
    expect(() =>
      fixture("github_download_repository_release_archive", {
        ...target,
        tagName: "other",
        archiveFormat: "zip",
      })
    ).toThrow("Unknown preview archive target");
  });
  it("allows immutable release downloads while rejecting uploads", () => {
    const fixture = createTransferFixtures(repositories, "immutable", true);
    expect(() => fixture("github_upload_repository_release_asset", target)).toThrow("Immutable");
    expect(
      fixture("github_download_repository_release_archive", {
        ...target,
        tagName: "v1.4.0",
        archiveFormat: "zip",
      })
    ).toMatchObject({ saved: true });
  });
});
