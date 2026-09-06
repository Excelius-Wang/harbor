import type * as Data from "@/features/github/github-data";

const viewer = "harbor-preview";
const timestamp = "2026-09-01T10:00:00Z";

export function createRepositoryActionFixtures(
  repositories: Data.GitHubRepository[],
  scenario: string | null,
  acceptWrites: boolean
) {
  const relationships = new Map<number, Data.GitHubRepositoryRelationship>();
  const settings = new Map<number, Data.GitHubRepositorySettings>();
  let nextId = 1000;
  const relationshipFor = (repository: Data.GitHubRepository): Data.GitHubRepositoryRelationship =>
    relationships.get(repository.id) ?? {
      starred: scenario === "starred" && repository.id === 1,
      watchLevel: scenario === "ignored" ? "ignored" : "participating",
      viewerLogin: viewer,
      viewerOwnsRepository: repository.owner === viewer,
    };
  const settingsFor = (repository: Data.GitHubRepository): Data.GitHubRepositorySettings => ({
    repository,
    visibility: repository.isPrivate ? "private" : "public",
    isTemplate: false,
    hasIssues: true,
    hasProjects: true,
    hasWiki: false,
    hasDiscussions: false,
    allowMergeCommit: true,
    allowSquashMerge: true,
    allowRebaseMerge: true,
    allowAutoMerge: false,
    allowUpdateBranch: true,
    deleteBranchOnMerge: false,
  });

  return (command: string, args: Record<string, unknown>, empty: boolean): unknown => {
    if (!scenario) return undefined;
    if (command === "github_list_repositories")
      return {
        repositories: empty ? [] : repositories.map((repository) => ({ ...repository })),
        page: 1,
        hasMore: false,
      } satisfies Data.GitHubRepositoryPage;
    if (command === "github_list_starred_repositories")
      return {
        repositories: empty
          ? []
          : repositories
              .filter((repository) => relationshipFor(repository).starred)
              .map((repository) => ({ repository: { ...repository }, starredAt: timestamp })),
        page: 1,
        hasMore: false,
      } satisfies Data.GitHubStarredRepositoryPage;

    if (acceptWrites && command === "github_create_personal_repository") {
      const input = args.input as Data.GitHubRepositoryCreateInput;
      const name = input.name.trim();
      if (
        repositories.some((repository) => repository.owner === viewer && repository.name === name)
      )
        throw { code: "githubValidation", message: "This preview repository already exists." };
      const repository: Data.GitHubRepository = {
        ...repositories[0],
        id: nextId++,
        owner: viewer,
        name,
        fullName: `${viewer}/${name}`,
        url: `https://github.com/${viewer}/${name}`,
        description: input.description,
        isPrivate: input.visibility === "private",
        isFork: false,
        stars: 0,
        forks: 0,
        openIssues: 0,
      };
      const result = {
        ...settingsFor(repository),
        homepage: input.homepage,
        hasIssues: input.hasIssues,
        hasProjects: input.hasProjects,
        hasWiki: input.hasWiki,
        hasDiscussions: input.hasDiscussions,
      } satisfies Data.GitHubRepositorySettings;
      repositories.unshift(repository);
      settings.set(repository.id, result);
      return structuredClone(result);
    }

    const index = repositories.findIndex(
      (repository) => repository.owner === args.owner && repository.name === args.repository
    );
    const repository = repositories[index];
    if (!repository) return undefined;
    const current = relationshipFor(repository);
    if (command === "github_get_repository_relationship") return { ...current };
    if (command === "github_get_personal_repository_settings" && settings.has(repository.id))
      return structuredClone({ ...settings.get(repository.id), repository });
    if (!acceptWrites) return undefined;
    if (command === "github_update_repository_star") {
      const update = () => {
        const liveIndex = repositories.findIndex((item) => item.id === repository.id);
        const liveRepository = repositories[liveIndex];
        const liveRelationship = relationshipFor(liveRepository);
        const starred = args.starred === true;
        const next = { ...liveRelationship, starred };
        relationships.set(repository.id, next);
        repositories[liveIndex] = {
          ...liveRepository,
          stars: Math.max(
            0,
            liveRepository.stars + Number(starred) - Number(liveRelationship.starred)
          ),
        };
        return { ...next };
      };
      return scenario === "slow-star"
        ? new Promise((resolve) => setTimeout(() => resolve(update()), 1500))
        : update();
    }
    if (command === "github_update_repository_watch") {
      if (!["participating", "allActivity", "ignored"].includes(String(args.watchLevel)))
        return undefined;
      const next = { ...current, watchLevel: args.watchLevel as Data.GitHubRepositoryWatchLevel };
      relationships.set(repository.id, next);
      return { ...next };
    }
    if (command === "github_fork_repository") {
      if (current.viewerOwnsRepository)
        throw { code: "githubPermission", message: "Cannot fork your own preview repository." };
      const name = String(args.name ?? repository.name);
      const existing = repositories.find((item) => item.owner === viewer && item.name === name);
      if (existing)
        return { repository: { ...existing }, created: false } satisfies Data.GitHubForkResult;
      const fork: Data.GitHubRepository = {
        ...repository,
        id: nextId++,
        owner: viewer,
        name,
        fullName: `${viewer}/${name}`,
        url: `https://github.com/${viewer}/${name}`,
        isFork: true,
        stars: 0,
        forks: 0,
      };
      const created = scenario !== "fork-existing";
      repositories[index] = { ...repository, forks: repository.forks + Number(created) };
      repositories.unshift(fork);
      settings.set(fork.id, settingsFor(fork));
      return { repository: { ...fork }, created } satisfies Data.GitHubForkResult;
    }
    return undefined;
  };
}
