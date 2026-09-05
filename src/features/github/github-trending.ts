import { queryOptions } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { githubQueryKeys } from "./github-queries";

export type GitHubTrendingPeriod = "daily" | "weekly" | "monthly";
export type GitHubTrendingKind = "repositories" | "developers";
export type GitHubTrendingFilters = { language: string | null; sponsorable: boolean };
export type GitHubTrendingLanguage = { slug: string; name: string };
export const DEFAULT_TRENDING_FILTERS: GitHubTrendingFilters = {
  language: null,
  sponsorable: false,
};

export type GitHubTrendingDeveloper = {
  rank: number;
  login: string;
  name: string;
  avatarUrl: string | null;
  popularRepository: {
    fullName: string;
    url: string;
    description: string | null;
  } | null;
};

export type GitHubTrendingDeveloperPage = {
  developers: GitHubTrendingDeveloper[];
  period: GitHubTrendingPeriod;
  languages: GitHubTrendingLanguage[];
};

export function trendingWebUrl(kind: GitHubTrendingKind, period: GitHubTrendingPeriod) {
  return `https://github.com/trending${kind === "developers" ? "/developers" : ""}?since=${period}`;
}

export function trendingDevelopersQueryOptions(
  period: GitHubTrendingPeriod,
  filters: GitHubTrendingFilters = DEFAULT_TRENDING_FILTERS
) {
  return queryOptions({
    queryKey: [...githubQueryKeys.all, "discovery", "trending", "developers", period, filters],
    queryFn: () =>
      invoke<GitHubTrendingDeveloperPage>("github_list_trending_developers", {
        period,
        ...filters,
      }),
    staleTime: 5 * 60_000,
  });
}
