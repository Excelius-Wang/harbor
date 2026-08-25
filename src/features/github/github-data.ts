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
