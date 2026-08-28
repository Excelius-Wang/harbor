import { CheckCircle2, CircleDot, GitMerge, GitPullRequest, PencilLine } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type {
  GitHubPullRequest,
  GitHubPullRequestReview,
  GitHubPullRequestSummary,
} from "./github-data";

type PullRequestState = Pick<
  GitHubPullRequest | GitHubPullRequestSummary,
  "state" | "draft" | "merged"
>;

export function GitHubPullRequestStateBadge({ pullRequest }: { pullRequest: PullRequestState }) {
  const { t } = useTranslation();
  const state = pullRequest.merged ? "merged" : pullRequest.draft ? "draft" : pullRequest.state;
  const Icon =
    state === "merged"
      ? GitMerge
      : state === "draft"
        ? PencilLine
        : state === "open"
          ? GitPullRequest
          : CheckCircle2;

  return (
    <Badge
      variant="outline"
      className={cn(
        "h-6 rounded-md px-2 font-medium",
        state === "open" && "border-primary/30 bg-primary/10 text-primary",
        state === "merged" && "border-merged/35 bg-merged/10 text-merged",
        (state === "closed" || state === "draft") && "bg-secondary text-secondary-foreground"
      )}
    >
      <Icon />
      {t(`workspace.repositories.pullRequestStates.${state}`)}
    </Badge>
  );
}

export function summarizeReviews(reviews: GitHubPullRequestReview[]) {
  const latest = new Map<string, GitHubPullRequestReview>();
  for (const review of reviews) {
    if (review.state === "commented" || review.state === "pending") continue;
    if (review.state === "dismissed") latest.delete(review.author);
    else latest.set(review.author, review);
  }

  const approved: GitHubPullRequestReview[] = [];
  const changesRequested: GitHubPullRequestReview[] = [];
  for (const review of latest.values()) {
    if (review.state === "approved") approved.push(review);
    if (review.state === "changesRequested") changesRequested.push(review);
  }
  return { approved, changesRequested };
}

export function ReviewStateIcon({ state }: { state: GitHubPullRequestReview["state"] }) {
  return state === "approved" ? (
    <CheckCircle2 className="text-success" />
  ) : state === "changesRequested" ? (
    <CircleDot className="text-destructive" />
  ) : (
    <CircleDot className="text-muted-foreground" />
  );
}

export function GitHubPullRequestRevisionGuard({
  from,
  to,
  expectedHeadSha,
  description,
}: {
  from: string;
  to: string;
  expectedHeadSha: string;
  description: string;
}) {
  return (
    <div className="bg-muted/45 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-md border px-3 py-2.5 text-xs">
      <div className="min-w-0">
        <p className="text-foreground truncate font-mono">
          {from}
          <span className="text-muted-foreground mx-1.5">→</span>
          {to}
        </p>
        <p className="text-muted-foreground mt-1">{description}</p>
      </div>
      <code className="text-primary bg-background rounded border px-2 py-1 font-mono text-[10px]">
        {expectedHeadSha.slice(0, 7)}
      </code>
    </div>
  );
}
