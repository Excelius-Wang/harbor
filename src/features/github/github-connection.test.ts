import { describe, expect, it } from "vitest";
import {
  cacheGitHubConnection,
  disconnectedGitHubConnection,
  readCachedGitHubConnection,
} from "./github-connection";

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  };
}

describe("GitHub connection metadata cache", () => {
  it("restores only non-sensitive connected-account metadata", () => {
    const storage = memoryStorage();
    cacheGitHubConnection(
      {
        connected: true,
        identity: {
          login: "octocat",
          avatarUrl: "https://avatars.githubusercontent.com/u/583231",
        },
      },
      storage
    );

    expect(readCachedGitHubConnection(storage)).toEqual({
      connected: true,
      identity: {
        login: "octocat",
        avatarUrl: "https://avatars.githubusercontent.com/u/583231",
      },
    });
  });

  it("drops disconnected and malformed cached values", () => {
    const storage = memoryStorage();
    storage.setItem("harbor.github.connection", JSON.stringify({ connected: true }));
    expect(readCachedGitHubConnection(storage)).toEqual(disconnectedGitHubConnection);

    cacheGitHubConnection(disconnectedGitHubConnection, storage);
    expect(storage.getItem("harbor.github.connection")).toBeNull();
  });
});
