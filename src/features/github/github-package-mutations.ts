import type { QueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import type {
  GitHubPackageType,
  GitHubPackageVersionAction,
  GitHubPackageVersionMutationResult,
} from "./github-data";
import { githubQueryKeys } from "./github-queries";

export type GitHubPackageVersionMutationInput = {
  packageType: GitHubPackageType;
  packageName: string;
  expectedPackageId: number;
  versionId: number;
  expectedVersionName: string;
  action: GitHubPackageVersionAction;
};

export function mutatePersonalPackageVersion(input: GitHubPackageVersionMutationInput) {
  return invoke<GitHubPackageVersionMutationResult>("github_mutate_personal_package_version", {
    input,
  });
}

export function invalidatePersonalPackage(
  queryClient: QueryClient,
  target: Pick<GitHubPackageVersionMutationInput, "packageType" | "packageName">
) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: githubQueryKeys.packagesRoot }),
    queryClient.invalidateQueries({
      queryKey: githubQueryKeys.package(target),
      exact: true,
    }),
    queryClient.invalidateQueries({
      queryKey: githubQueryKeys.packageVersionsRoot(target),
    }),
  ]);
}
