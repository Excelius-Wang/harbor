import type { GitHubCommitDetailPage } from "./github-data";
import type { IpcError } from "@/lib/ipc-error";

const NON_RETRYABLE_COMMIT_ERROR_CODES = new Set([
  "githubAuthentication",
  "githubCodeConflict",
  "githubNotConnected",
  "githubPermission",
  "validation",
]);

export function isRetryableCommitDetailError(error: IpcError) {
  return !NON_RETRYABLE_COMMIT_ERROR_CODES.has(error.code);
}

export function matchingCommitDetailPages(pages: GitHubCommitDetailPage[]) {
  const first = pages[0];
  if (!first) return [];
  const identity = JSON.stringify(first.commit);
  const matching = [first];
  for (const page of pages.slice(1)) {
    if (JSON.stringify(page.commit) !== identity || page.page !== matching.length + 1) break;
    matching.push(page);
  }
  return matching;
}
