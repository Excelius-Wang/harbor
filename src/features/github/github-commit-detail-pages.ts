import type { GitHubCommitDetailPage } from "./github-data";

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
