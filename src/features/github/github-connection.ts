export type GitHubIdentity = {
  login: string;
  avatarUrl?: string;
};

export type GitHubConnection = {
  connected: boolean;
  identity?: GitHubIdentity;
};

type ConnectionStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

const STORAGE_KEY = "harbor.github.connection";

export const disconnectedGitHubConnection: GitHubConnection = { connected: false };

export function readCachedGitHubConnection(storage?: ConnectionStorage): GitHubConnection {
  try {
    const target = storage ?? globalThis.localStorage;
    const value = target.getItem(STORAGE_KEY);
    if (!value) return disconnectedGitHubConnection;

    const connection = JSON.parse(value) as Partial<GitHubConnection>;
    const login = connection.identity?.login;
    const avatarUrl = connection.identity?.avatarUrl;
    if (
      connection.connected !== true ||
      typeof login !== "string" ||
      !login.trim() ||
      (avatarUrl !== undefined && typeof avatarUrl !== "string")
    ) {
      return disconnectedGitHubConnection;
    }

    return {
      connected: true,
      identity: { login, ...(avatarUrl ? { avatarUrl } : {}) },
    };
  } catch {
    return disconnectedGitHubConnection;
  }
}

export function cacheGitHubConnection(
  connection: GitHubConnection,
  storage?: ConnectionStorage
): void {
  try {
    const target = storage ?? globalThis.localStorage;
    if (!connection.connected || !connection.identity) {
      target.removeItem(STORAGE_KEY);
      return;
    }
    target.setItem(STORAGE_KEY, JSON.stringify(connection));
  } catch {
    // Connection metadata is only a UI cache; authentication must not depend on it.
  }
}
