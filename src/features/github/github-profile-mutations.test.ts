import { QueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GitHubUserProfile } from "./github-data";
import {
  syncUserFollow,
  syncUserProfile,
  updatePersonalProfile,
  updateUserFollow,
} from "./github-profile-mutations";
import { githubQueryKeys } from "./github-queries";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

const viewer: GitHubUserProfile = {
  id: 1,
  login: "octocat",
  avatarUrl: "https://avatars.githubusercontent.com/u/1",
  url: "https://github.com/octocat",
  name: "The Octocat",
  hireable: false,
  publicRepositories: 8,
  publicGists: 2,
  followers: 20,
  following: 4,
  createdAt: "2008-01-14T04:33:35Z",
  updatedAt: "2026-08-28T00:00:00Z",
  viewerOwnsProfile: true,
  viewerFollows: false,
  followsViewer: false,
};

const followedUser: GitHubUserProfile = {
  ...viewer,
  id: 2,
  login: "hubot",
  url: "https://github.com/hubot",
  viewerOwnsProfile: false,
  viewerFollows: true,
};

describe("GitHub profile mutations", () => {
  beforeEach(() => {
    vi.mocked(invoke).mockReset();
    vi.mocked(invoke).mockResolvedValue(viewer);
  });

  it("uses personal profile and follow Tauri contracts", async () => {
    const input = {
      name: "The Octocat",
      bio: "Builds useful things",
      company: "GitHub",
      location: "San Francisco",
      blog: "https://github.blog",
      email: "octocat@github.com",
      twitterUsername: "monatheoctocat",
      hireable: true,
    };
    await updatePersonalProfile(input);
    await updateUserFollow("hubot", true);

    expect(invoke).toHaveBeenNthCalledWith(1, "github_update_personal_profile", { input });
    expect(invoke).toHaveBeenNthCalledWith(2, "github_update_user_follow", {
      username: "hubot",
      followed: true,
    });
  });

  it("reconciles viewer aliases and adjusts following only for a real state change", () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(githubQueryKeys.profile({ username: null }), viewer);

    syncUserProfile(queryClient, { ...viewer, bio: "Updated" });
    expect(
      queryClient.getQueryData<GitHubUserProfile>(githubQueryKeys.profile({ username: "octocat" }))
        ?.bio
    ).toBe("Updated");

    syncUserFollow(queryClient, followedUser, false);
    expect(
      queryClient.getQueryData<GitHubUserProfile>(githubQueryKeys.profile({ username: null }))
        ?.following
    ).toBe(5);
    syncUserFollow(queryClient, followedUser, true);
    expect(
      queryClient.getQueryData<GitHubUserProfile>(githubQueryKeys.profile({ username: null }))
        ?.following
    ).toBe(5);
  });
});
