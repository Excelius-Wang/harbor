import { QueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  invalidatePersonalPackage,
  mutatePersonalPackageVersion,
} from "./github-package-mutations";
import { githubQueryKeys } from "./github-queries";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

describe("personal GitHub Package mutations", () => {
  beforeEach(() => vi.mocked(invoke).mockReset());

  it("sends every authoritative package and version guard", async () => {
    vi.mocked(invoke).mockResolvedValue({
      packageId: 41,
      packageType: "container",
      packageName: "harbor/desktop",
      versionId: 73,
      versionName: "sha256:abc",
      action: "delete",
    });

    await mutatePersonalPackageVersion({
      packageType: "container",
      packageName: "harbor/desktop",
      expectedPackageId: 41,
      versionId: 73,
      expectedVersionName: "sha256:abc",
      action: "delete",
    });

    expect(invoke).toHaveBeenCalledWith("github_mutate_personal_package_version", {
      input: {
        packageType: "container",
        packageName: "harbor/desktop",
        expectedPackageId: 41,
        versionId: 73,
        expectedVersionName: "sha256:abc",
        action: "delete",
      },
    });
  });

  it("invalidates inventory, authoritative detail, and both version states", async () => {
    const client = new QueryClient();
    const target = { packageType: "npm" as const, packageName: "@harbor/desktop" };
    const listKey = githubQueryKeys.packages({
      packageType: "npm",
      visibility: null,
      page: 1,
    });
    const detailKey = githubQueryKeys.package(target);
    const activeKey = githubQueryKeys.packageVersions({ ...target, state: "active", page: 1 });
    const deletedKey = githubQueryKeys.packageVersions({ ...target, state: "deleted", page: 1 });
    for (const key of [listKey, detailKey, activeKey, deletedKey]) {
      client.setQueryData(key, {});
    }

    await invalidatePersonalPackage(client, target);

    for (const key of [listKey, detailKey, activeKey, deletedKey]) {
      expect(client.getQueryState(key)?.isInvalidated).toBe(true);
    }
  });
});
