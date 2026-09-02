import { invoke } from "@tauri-apps/api/core";
import type { GitHubRepositoryTopics } from "./github-data";

export type GitHubRepositoryTopicsTarget = {
  owner: string;
  repository: string;
};

export type GitHubRepositoryTopicsMutation = {
  names: string[];
  expectedNames: string[];
};

export type GitHubRepositoryTopicsParseResult =
  | { names: string[]; error: null }
  | { names: null; error: "invalid" | "duplicate" | "tooMany" };

const MAX_TOPIC_COUNT = 20;
const MAX_TOPIC_LENGTH = 50;

export function parseRepositoryTopics(value: string): GitHubRepositoryTopicsParseResult {
  const rawNames = value
    .split(/[,\n]/)
    .map((name) => name.trim())
    .filter(Boolean);
  if (rawNames.length > MAX_TOPIC_COUNT) return { names: null, error: "tooMany" };

  const names = rawNames.map((name) => name.toLowerCase());
  if (names.some((name) => name.length > MAX_TOPIC_LENGTH || !/^[a-z0-9-]+$/.test(name))) {
    return { names: null, error: "invalid" };
  }
  if (new Set(names).size !== names.length) return { names: null, error: "duplicate" };
  return { names, error: null };
}

export function updatePersonalRepositoryTopics(
  target: GitHubRepositoryTopicsTarget,
  mutation: GitHubRepositoryTopicsMutation
) {
  return invoke<GitHubRepositoryTopics>("github_update_personal_repository_topics", {
    ...target,
    mutation,
  });
}
