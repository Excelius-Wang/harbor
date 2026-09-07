import { expect, it } from "vitest";
import type * as Data from "@/features/github/github-data";
import { createPackageFixtures } from "./package-fixtures";

const target = { packageType: "container", packageName: "harbor-desktop" };
const input = {
  ...target,
  expectedPackageId: 1,
  versionId: 4,
  expectedVersionName: "1.2.0",
  action: "restore",
};
it("uses production versionState and reconciles restoration/deletion without mutating snapshots", () => {
  const invoke = createPackageFixtures(null, true);
  const read = (versionState: string) =>
    invoke(
      "github_list_personal_package_versions",
      { ...target, versionState },
      false
    ) as Data.GitHubPackageVersionPage;
  const before = read("deleted");
  expect(before.versions.map((v) => v.name)).toEqual(["1.2.0"]);
  invoke("github_mutate_personal_package_version", { input }, false);
  expect(read("deleted").versions).toHaveLength(0);
  expect(read("active").versions).toHaveLength(4);
  expect(before.versions[0].state).toBe("deleted");
  const detail = invoke("github_get_personal_package", target, false) as Data.GitHubPackage;
  expect(detail.versionCount).toBe(4);
  invoke(
    "github_mutate_personal_package_version",
    { input: { ...input, action: "delete" } },
    false
  );
  expect(read("deleted").versions).toHaveLength(1);
  expect(detail.versionCount).toBe(4);
  expect(
    (invoke("github_get_personal_package", target, false) as Data.GitHubPackage).versionCount
  ).toBe(3);
});
it("rejects unauthorized, conflicting and unknown mutations and supports a retry", () => {
  expect(() =>
    createPackageFixtures(null, false)("github_mutate_personal_package_version", { input }, false)
  ).toThrow();
  const invoke = createPackageFixtures(null, true);
  expect(() =>
    invoke(
      "github_mutate_personal_package_version",
      { input: { ...input, expectedPackageId: 7 } },
      false
    )
  ).toThrow();
  expect(invoke("github_unknown_write", {}, false)).toBeUndefined();
  const retry = createPackageFixtures("retry", true);
  expect(() => retry("github_mutate_personal_package_version", { input }, false)).toThrow();
  expect(retry("github_mutate_personal_package_version", { input }, false)).toMatchObject({
    action: "restore",
  });
});
