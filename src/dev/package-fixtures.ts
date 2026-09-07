import type * as Data from "@/features/github/github-data";
import type { GitHubPackageVersionMutationInput } from "@/features/github/github-package-mutations";

const timestamp = "2026-09-07T07:00:00Z";
const names = [
  "harbor-desktop",
  "workspace-components",
  "workspace-preview",
  "documentation-tools",
];

export function createPackageFixtures(mode: string | null, acceptWrites: boolean) {
  const inventories = new Map<string, Data.GitHubPackage[]>();
  const versions = new Map<string, Data.GitHubPackageVersion[]>();
  let failedOnce = false;
  const fail = (code: string) => {
    throw { code, message: "The package operation could not be completed. Please retry." };
  };
  return (command: string, args: Record<string, unknown>, empty: boolean): unknown => {
    if (
      ![
        "github_list_personal_packages",
        "github_get_personal_package",
        "github_list_personal_package_versions",
        "github_mutate_personal_package_version",
      ].includes(command)
    )
      return undefined;
    const input = args.input as GitHubPackageVersionMutationInput | undefined;
    const packageType = (input?.packageType ??
      args.packageType ??
      "container") as Data.GitHubPackageType;
    if (!inventories.has(packageType)) {
      inventories.set(
        packageType,
        Array.from({ length: mode === "long" ? 24 : 4 }, (_, index) => {
          const name =
            names[index % names.length] +
            (index >= 4 ? `-${index}` : "") +
            (mode === "long" && index === 0 ? "-" + "extended-workspace-".repeat(6) : "");
          const item: Data.GitHubPackage = {
            id: index + 1,
            name,
            packageType,
            owner: "harbor-preview",
            visibility: { kind: index === 1 ? "private" : "public" },
            versionCount: 3,
            url: `https://github.com/users/harbor-preview/packages/${packageType}/${name}`,
            createdAt: timestamp,
            updatedAt: timestamp,
          };
          versions.set(
            `${packageType}:${name}`,
            ["1.4.0", "1.3.2", "1.3.1", "1.2.0"].map((name, versionIndex) => ({
              id: versionIndex + 1,
              name,
              state: versionIndex === 3 ? "deleted" : "active",
              metadata:
                packageType === "container"
                  ? { kind: "container", tags: [name] }
                  : { kind: "unknown", raw: {} },
              description:
                mode === "long"
                  ? "A desktop workspace package with a detailed description that remains readable in a narrow pane. ".repeat(
                      4
                    )
                  : "Desktop workspace preview",
              url: `${item.url}/versions/${versionIndex + 1}`,
              createdAt: timestamp,
              updatedAt: timestamp,
              ...(versionIndex === 3 ? { deletedAt: timestamp } : {}),
            }))
          );
          return item;
        })
      );
    }
    const inventory = inventories.get(packageType)!;
    const page = { page: Number(args.page) || 1, hasMore: false, hasPrevious: false };
    if (command === "github_list_personal_packages")
      return structuredClone({
        ...page,
        packages: empty
          ? []
          : inventory.filter(
              (item) => !args.visibility || item.visibility.kind === args.visibility
            ),
      } satisfies Data.GitHubPackagePage);
    const item = inventory.find((item) => item.name === (input?.packageName ?? args.packageName));
    if (!item) return fail("githubPackageConflict");
    if (command === "github_get_personal_package") return structuredClone(item);
    const records = versions.get(`${packageType}:${item.name}`)!;
    if (command === "github_list_personal_package_versions") {
      const state = args.versionState === "deleted" ? "deleted" : "active";
      return structuredClone({
        ...page,
        state,
        versions: empty ? [] : records.filter((version) => version.state === state),
      } satisfies Data.GitHubPackageVersionPage);
    }
    if (!acceptWrites) return fail("previewWriteDisabled");
    if (mode === "permission") return fail("githubPermission");
    if (mode === "conflict") return fail("githubPackageConflict");
    if (mode === "retry" && !failedOnce) {
      failedOnce = true;
      return fail("preview");
    }
    const version = records.find((version) => version.id === input?.versionId);
    if (
      !input ||
      item.id !== input.expectedPackageId ||
      !version ||
      version.name !== input.expectedVersionName ||
      !["delete", "restore"].includes(input.action) ||
      version.state !== (input.action === "restore" ? "deleted" : "active")
    )
      return fail("githubPackageConflict");
    version.state = input.action === "restore" ? "active" : "deleted";
    version.deletedAt = input.action === "delete" ? timestamp : undefined;
    item.versionCount = records.filter((version) => version.state === "active").length;
    return {
      packageId: item.id,
      packageType,
      packageName: item.name,
      versionId: version.id,
      versionName: version.name,
      action: input.action,
    } satisfies Data.GitHubPackageVersionMutationResult;
  };
}
