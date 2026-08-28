import type { QueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import type { GitHubUserProfile, GitHubUserProfileUpdate } from "./github-data";
import { githubQueryKeys } from "./github-queries";

export function updatePersonalProfile(input: GitHubUserProfileUpdate) {
  return invoke<GitHubUserProfile>("github_update_personal_profile", { input });
}

export function updateUserFollow(username: string, followed: boolean) {
  return invoke<GitHubUserProfile>("github_update_user_follow", { username, followed });
}

export function syncUserProfile(queryClient: QueryClient, profile: GitHubUserProfile) {
  queryClient.setQueryData(githubQueryKeys.profile({ username: profile.login }), profile);
  if (profile.viewerOwnsProfile) {
    queryClient.setQueryData(githubQueryKeys.profile({ username: null }), profile);
  }
}

export function syncUserFollow(
  queryClient: QueryClient,
  profile: GitHubUserProfile,
  previousFollowed: boolean
) {
  syncUserProfile(queryClient, profile);
  if (previousFollowed === profile.viewerFollows) return;
  const change = profile.viewerFollows ? 1 : -1;
  queryClient.setQueryData<GitHubUserProfile>(
    githubQueryKeys.profile({ username: null }),
    (viewer) => (viewer ? { ...viewer, following: Math.max(0, viewer.following + change) } : viewer)
  );
}

export function invalidateProfiles(queryClient: QueryClient, username?: string) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: githubQueryKeys.profilesRoot }),
    username
      ? queryClient.invalidateQueries({
          queryKey: githubQueryKeys.profileConnectionsRoot({ username }),
        })
      : Promise.resolve(),
  ]);
}
