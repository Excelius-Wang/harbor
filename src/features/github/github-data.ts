export type GitHubRepository = {
  id: number;
  owner: string;
  name: string;
  fullName: string;
  description?: string;
  url: string;
  language?: string;
  stars: number;
  forks: number;
  openIssues: number;
  defaultBranch: string;
  isPrivate: boolean;
  isFork: boolean;
  isArchived: boolean;
  updatedAt?: string;
};

export type GitHubRepositoryPage = {
  repositories: GitHubRepository[];
  hasMore: boolean;
};

export type GitHubIssueLabel = {
  name: string;
  color: string;
};

export type GitHubIssue = {
  id: number;
  number: number;
  title: string;
  body?: string;
  url: string;
  author: string;
  assignees: string[];
  labels: GitHubIssueLabel[];
  comments: number;
  createdAt: string;
  updatedAt: string;
};

export type GitHubIssuePage = {
  issues: GitHubIssue[];
  hasMore: boolean;
};

export type GitHubBranch = {
  name: string;
  sha: string;
  protected: boolean;
};

export type GitHubCommitSummary = {
  sha: string;
  shortSha: string;
  title: string;
  author: string;
  authoredAt?: string;
  url: string;
};

export type GitHubReadme = {
  name: string;
  path: string;
  content: string;
  url: string;
};

export type GitHubCodeOverview = {
  reference: string;
  branches: GitHubBranch[];
  branchesHaveMore: boolean;
  commits: GitHubCommitSummary[];
  commitsHaveMore: boolean;
  readme?: GitHubReadme;
};

export type GitHubContentEntry = {
  name: string;
  path: string;
  sha: string;
  kind: "dir" | "file" | "symlink" | "submodule" | string;
  size: number;
  url?: string;
  downloadUrl?: string;
};

export type GitHubContentListing = {
  reference: string;
  path: string;
  entries: GitHubContentEntry[];
};
