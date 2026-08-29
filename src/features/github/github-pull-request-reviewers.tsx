import { useMemo, useState } from "react";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, CircleAlert, Pencil, RotateCcw, UserRound, UsersRound } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { parseIpcError } from "@/lib/ipc-error";
import type {
  GitHubPullRequest,
  GitHubPullRequestRepository,
  GitHubPullRequestReview,
  GitHubPullRequestReviewTeam,
} from "./github-data";
import {
  dismissRepositoryPullRequestReview,
  invalidatePullRequestAfterReviewDismissal,
  invalidateRepositoryPullRequest,
  removeRepositoryPullRequestReviewers,
  requestRepositoryPullRequestReviewers,
  syncDismissedPullRequestReview,
  syncUpdatedPullRequest,
  type GitHubPullRequestMutationTarget,
} from "./github-pull-request-mutations";
import {
  GitHubPullRequestReviewDismissalDialog,
  GitHubPullRequestReviewDismissalMenu,
} from "./github-pull-request-review-dismissal";
import { GitHubPullRequestConvertToDraft } from "./github-pull-request-lifecycle";
import { ReviewStateIcon, summarizeReviews } from "./github-pull-request-shared";
import {
  pullRequestReviewsQueryOptions,
  repositoryIssueAssigneesQueryOptions,
  repositoryPullRequestReviewTeamsQueryOptions,
} from "./github-queries";

type ReviewerKind = "user" | "team";

type ReviewerOption = {
  kind: ReviewerKind;
  key: string;
  label: string;
  description?: string;
  avatarUrl?: string;
  reviewState?: GitHubPullRequestReview["state"];
};

type ReviewerMutation = ReviewerOption & {
  action: "request" | "remove";
};

function sameName(left: string, right: string) {
  return left.localeCompare(right, undefined, { sensitivity: "accent" }) === 0;
}

function ReviewerOptionsError({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const { t } = useTranslation();
  const parsed = parseIpcError(error);
  return (
    <Alert variant="destructive">
      <CircleAlert />
      <AlertTitle>{t("workspace.repositories.reviewerOptionsLoadFailed")}</AlertTitle>
      <AlertDescription className="flex flex-col items-start gap-2">
        <span>{parsed.message}</span>
        <Button type="button" variant="outline" size="xs" onClick={onRetry}>
          {t("workspace.repositories.retry")}
        </Button>
      </AlertDescription>
    </Alert>
  );
}

function ReviewerOptionList({
  kind,
  options,
  pullRequest,
  pending,
  onChange,
}: {
  kind: ReviewerKind;
  options: ReviewerOption[];
  pullRequest: GitHubPullRequest;
  pending?: ReviewerMutation;
  onChange: (value: ReviewerMutation) => void;
}) {
  const { t } = useTranslation();

  return (
    <Command className="min-h-0 rounded-md border">
      <CommandInput
        placeholder={t(
          kind === "team"
            ? "workspace.repositories.searchReviewTeams"
            : "workspace.repositories.searchReviewers"
        )}
      />
      <CommandList className="max-h-[320px]">
        <CommandEmpty>
          {t(
            kind === "team"
              ? "workspace.repositories.noMatchingReviewTeams"
              : "workspace.repositories.noMatchingReviewers"
          )}
        </CommandEmpty>
        <CommandGroup>
          {options.map((option) => {
            const isRequested =
              option.kind === "user"
                ? pullRequest.requestedReviewers.some((reviewer) => sameName(reviewer, option.key))
                : pullRequest.requestedTeams.some((team) => sameName(team.slug, option.key));
            const isPending = pending?.kind === option.kind && sameName(pending.key, option.key);
            const action = isRequested ? "remove" : "request";
            const status = isRequested
              ? t("workspace.repositories.reviewRequested")
              : option.reviewState
                ? t("workspace.repositories.reRequestReview")
                : t("workspace.repositories.requestReview");

            return (
              <CommandItem
                key={`${option.kind}:${option.key}`}
                value={`${option.label} ${option.description ?? ""}`}
                disabled={Boolean(pending)}
                onSelect={() => onChange({ ...option, action })}
              >
                <Avatar className="size-7">
                  {option.avatarUrl ? <AvatarImage src={option.avatarUrl} alt="" /> : null}
                  <AvatarFallback>
                    {option.kind === "team" ? (
                      <UsersRound />
                    ) : (
                      option.label.slice(0, 1).toUpperCase()
                    )}
                  </AvatarFallback>
                </Avatar>
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="truncate">
                    {option.kind === "user" ? `@${option.label}` : option.label}
                  </span>
                  <span className="text-muted-foreground truncate text-[10px]">{status}</span>
                </span>
                {isPending ? (
                  <Spinner />
                ) : isRequested ? (
                  <Check className="ml-auto" />
                ) : option.reviewState ? (
                  <RotateCcw className="text-muted-foreground ml-auto" />
                ) : null}
              </CommandItem>
            );
          })}
        </CommandGroup>
      </CommandList>
    </Command>
  );
}

function GitHubPullRequestReviewerDialog({
  repository,
  pullRequest,
  reviews,
  onOpenChange,
}: {
  repository: GitHubPullRequestRepository;
  pullRequest: GitHubPullRequest;
  reviews: GitHubPullRequestReview[];
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const target: GitHubPullRequestMutationTarget = {
    owner: repository.owner,
    repository: repository.name,
    pullRequestNumber: pullRequest.number,
  };
  const assignees = useQuery(
    repositoryIssueAssigneesQueryOptions({
      owner: repository.owner,
      repository: repository.name,
    })
  );
  const teams = useQuery(
    repositoryPullRequestReviewTeamsQueryOptions({
      owner: repository.owner,
      repository: repository.name,
    })
  );
  const reviewSummary = useMemo(() => summarizeReviews(reviews), [reviews]);
  const reviewStateByLogin = useMemo(
    () =>
      new Map(
        [...reviewSummary.approved, ...reviewSummary.changesRequested].map((review) => [
          review.author.toLocaleLowerCase(),
          review.state,
        ])
      ),
    [reviewSummary]
  );
  const userOptions = useMemo(() => {
    const candidates = new Map<string, ReviewerOption>();
    const add = (login: string, avatarUrl?: string) => {
      if (sameName(login, pullRequest.author)) return;
      const key = login.toLocaleLowerCase();
      candidates.set(key, {
        kind: "user",
        key: login,
        label: login,
        avatarUrl: avatarUrl ?? candidates.get(key)?.avatarUrl,
        reviewState: reviewStateByLogin.get(key),
      });
    };
    assignees.data?.assignees.forEach((assignee) => add(assignee.login, assignee.avatarUrl));
    pullRequest.requestedReviewers.forEach((reviewer) => add(reviewer));
    reviews.forEach((review) => add(review.author, review.authorAvatarUrl));
    return [...candidates.values()].sort((left, right) => left.label.localeCompare(right.label));
  }, [assignees.data?.assignees, pullRequest, reviewStateByLogin, reviews]);
  const teamOptions = useMemo(() => {
    const candidates = new Map<string, GitHubPullRequestReviewTeam>();
    teams.data?.teams.forEach((team) => candidates.set(team.slug.toLocaleLowerCase(), team));
    pullRequest.requestedTeams.forEach((team) =>
      candidates.set(team.slug.toLocaleLowerCase(), team)
    );
    return [...candidates.values()]
      .map<ReviewerOption>((team) => ({
        kind: "team",
        key: team.slug,
        label: team.name,
        description: team.description,
      }))
      .sort((left, right) => left.label.localeCompare(right.label));
  }, [pullRequest.requestedTeams, teams.data?.teams]);
  const mutation = useMutation({
    mutationFn: (value: ReviewerMutation) => {
      const selection = {
        reviewers: value.kind === "user" ? [value.key] : [],
        teamReviewers: value.kind === "team" ? [value.key] : [],
      };
      return value.action === "request"
        ? requestRepositoryPullRequestReviewers(target, selection)
        : removeRepositoryPullRequestReviewers(target, selection);
    },
    onSuccess: (updated) => {
      syncUpdatedPullRequest(queryClient, target, updated);
      toast.success(t("workspace.repositories.reviewRequestUpdated"));
      void invalidateRepositoryPullRequest(queryClient, target);
    },
  });
  const mutationError = mutation.error ? parseIpcError(mutation.error) : null;

  return (
    <Dialog open onOpenChange={(open) => !mutation.isPending && onOpenChange(open)}>
      <DialogContent className="max-h-[calc(100vh-2rem)] gap-0 overflow-hidden p-0 sm:max-w-[620px]">
        <DialogHeader className="p-5 pb-3">
          <DialogTitle>{t("workspace.repositories.manageReviewers")}</DialogTitle>
          <DialogDescription>
            {t("workspace.repositories.manageReviewersDescription", {
              number: pullRequest.number,
            })}
          </DialogDescription>
        </DialogHeader>
        <Tabs defaultValue="users" className="min-h-0 gap-0">
          <TabsList variant="line" className="mx-5 h-9 justify-start rounded-none p-0">
            <TabsTrigger value="users" disabled={mutation.isPending}>
              <UserRound /> {t("workspace.repositories.people")}
            </TabsTrigger>
            <TabsTrigger value="teams" disabled={mutation.isPending}>
              <UsersRound /> {t("workspace.repositories.teams")}
            </TabsTrigger>
          </TabsList>
          <TabsContent value="users" className="flex min-h-0 flex-col gap-3 p-5 pt-3">
            {assignees.error ? (
              <ReviewerOptionsError
                error={assignees.error}
                onRetry={() => void assignees.refetch()}
              />
            ) : null}
            {assignees.isPending && !userOptions.length ? (
              <div className="flex min-h-28 items-center justify-center">
                <Spinner />
              </div>
            ) : (
              <ReviewerOptionList
                kind="user"
                options={userOptions}
                pullRequest={pullRequest}
                pending={mutation.isPending ? mutation.variables : undefined}
                onChange={(value) => mutation.mutate(value)}
              />
            )}
          </TabsContent>
          <TabsContent value="teams" className="flex min-h-0 flex-col gap-3 p-5 pt-3">
            {teams.error ? (
              <ReviewerOptionsError error={teams.error} onRetry={() => void teams.refetch()} />
            ) : null}
            {teams.isPending && !teamOptions.length ? (
              <div className="flex min-h-28 items-center justify-center">
                <Spinner />
              </div>
            ) : (
              <ReviewerOptionList
                kind="team"
                options={teamOptions}
                pullRequest={pullRequest}
                pending={mutation.isPending ? mutation.variables : undefined}
                onChange={(value) => mutation.mutate(value)}
              />
            )}
          </TabsContent>
        </Tabs>
        {mutationError ? (
          <Alert variant="destructive" className="mx-5 mb-4 w-auto">
            <CircleAlert />
            <AlertTitle>{t("workspace.repositories.updateReviewRequestFailed")}</AlertTitle>
            <AlertDescription>
              {mutationError.code === "githubPermission"
                ? t("workspace.repositories.pullRequestWritePermissionDenied")
                : mutationError.message}
            </AlertDescription>
          </Alert>
        ) : null}
        <DialogFooter className="border-t p-4">
          <Button
            type="button"
            variant="outline"
            disabled={mutation.isPending}
            onClick={() => onOpenChange(false)}
          >
            {t("workspace.repositories.close")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function GitHubPullRequestReviewers({
  repository,
  pullRequest,
  reviews,
  reviewsHaveMore,
}: {
  repository: GitHubPullRequestRepository;
  pullRequest: GitHubPullRequest;
  reviews: GitHubPullRequestReview[];
  reviewsHaveMore: boolean;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [dismissalReview, setDismissalReview] = useState<GitHubPullRequestReview | null>(null);
  const [dismissalMessage, setDismissalMessage] = useState("");
  const target: GitHubPullRequestMutationTarget = {
    owner: repository.owner,
    repository: repository.name,
    pullRequestNumber: pullRequest.number,
  };
  const reviewsQuery = useInfiniteQuery({
    ...pullRequestReviewsQueryOptions(target),
    initialData: {
      pages: [
        {
          reviews,
          page: 1,
          hasPrevious: false,
          hasMore: reviewsHaveMore,
        },
      ],
      pageParams: [1],
    },
  });
  const loadedReviews = useMemo(
    () => reviewsQuery.data.pages.flatMap((page) => page.reviews),
    [reviewsQuery.data.pages]
  );
  const reviewSummary = useMemo(() => summarizeReviews(loadedReviews), [loadedReviews]);
  const dismissal = useMutation({
    mutationFn: ({ review, message }: { review: GitHubPullRequestReview; message: string }) =>
      dismissRepositoryPullRequestReview(target, review.id, message),
    onSuccess: (updated) => {
      syncDismissedPullRequestReview(queryClient, target, updated);
      setDismissalReview(null);
      setDismissalMessage("");
      toast.success(t("workspace.repositories.reviewDismissed"));
      void invalidatePullRequestAfterReviewDismissal(queryClient, target);
    },
    onError: () => {
      void invalidatePullRequestAfterReviewDismissal(queryClient, target);
    },
  });
  const dismissalError = dismissal.error ? parseIpcError(dismissal.error) : null;
  const dismissalErrorMessage = dismissalError
    ? dismissalError.code === "githubPermission"
      ? t("workspace.repositories.pullRequestWritePermissionDenied")
      : dismissalError.code === "githubPullRequestReviewDismissalConflict"
        ? t("workspace.repositories.dismissReviewConflict")
        : dismissalError.message
    : null;
  const requestedUsers = new Set(
    pullRequest.requestedReviewers.map((reviewer) => reviewer.toLocaleLowerCase())
  );
  const approved = reviewSummary.approved.filter(
    (review) => !requestedUsers.has(review.author.toLocaleLowerCase())
  );
  const changesRequested = reviewSummary.changesRequested.filter(
    (review) => !requestedUsers.has(review.author.toLocaleLowerCase())
  );
  const hasReviewers =
    approved.length > 0 ||
    changesRequested.length > 0 ||
    pullRequest.requestedReviewers.length > 0 ||
    pullRequest.requestedTeams.length > 0;

  return (
    <>
      <div>
        <div className="mb-2 flex items-center justify-between gap-2">
          <p className="text-muted-foreground flex min-w-0 items-center gap-1.5 text-[10px] font-medium tracking-[0.08em] uppercase">
            <UserRound /> {t("workspace.repositories.reviewers")}
          </p>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label={t("workspace.repositories.editReviewers")}
            onClick={() => setOpen(true)}
          >
            <Pencil />
          </Button>
        </div>
        <div className="flex flex-col gap-2">
          {changesRequested.map((review) => (
            <ReviewerState
              key={review.id}
              review={review}
              onDismiss={() => {
                dismissal.reset();
                setDismissalReview(review);
                setDismissalMessage("");
              }}
            />
          ))}
          {approved.map((review) => (
            <ReviewerState
              key={review.id}
              review={review}
              onDismiss={() => {
                dismissal.reset();
                setDismissalReview(review);
                setDismissalMessage("");
              }}
            />
          ))}
          {pullRequest.requestedReviewers.map((reviewer) => (
            <div key={reviewer} className="flex min-w-0 items-center gap-2 text-xs">
              <Avatar size="sm">
                <AvatarFallback>{reviewer.slice(0, 1).toUpperCase()}</AvatarFallback>
              </Avatar>
              <span className="truncate">@{reviewer}</span>
              <span className="text-muted-foreground ml-auto text-[9px]">
                {t("workspace.repositories.reviewRequested")}
              </span>
            </div>
          ))}
          {pullRequest.requestedTeams.map((team) => (
            <div key={team.slug} className="flex min-w-0 items-center gap-2 text-xs">
              <Avatar size="sm">
                <AvatarFallback>
                  <UsersRound />
                </AvatarFallback>
              </Avatar>
              <span className="truncate">{team.name}</span>
              <span className="text-muted-foreground ml-auto text-[9px]">
                {t("workspace.repositories.reviewRequested")}
              </span>
            </div>
          ))}
          {!hasReviewers ? (
            <span className="text-muted-foreground text-xs">
              {t("workspace.repositories.none")}
            </span>
          ) : null}
          {reviewsQuery.error ? (
            <Alert variant="destructive">
              <CircleAlert />
              <AlertTitle>{t("workspace.repositories.reviewsLoadFailed")}</AlertTitle>
              <AlertDescription>{parseIpcError(reviewsQuery.error).message}</AlertDescription>
            </Alert>
          ) : null}
          {reviewsQuery.hasNextPage ? (
            <Button
              type="button"
              variant="outline"
              size="xs"
              disabled={reviewsQuery.isFetchingNextPage}
              onClick={() => void reviewsQuery.fetchNextPage()}
            >
              {reviewsQuery.isFetchingNextPage ? <Spinner data-icon="inline-start" /> : null}
              {t(
                reviewsQuery.isFetchingNextPage
                  ? "workspace.repositories.loadingMoreReviews"
                  : "workspace.repositories.loadMoreReviews"
              )}
            </Button>
          ) : null}
        </div>
        {pullRequest.state === "open" && !pullRequest.merged && !pullRequest.draft ? (
          <GitHubPullRequestConvertToDraft repository={repository} pullRequest={pullRequest} />
        ) : null}
      </div>
      {open ? (
        <GitHubPullRequestReviewerDialog
          repository={repository}
          pullRequest={pullRequest}
          reviews={loadedReviews}
          onOpenChange={setOpen}
        />
      ) : null}
      <GitHubPullRequestReviewDismissalDialog
        open={Boolean(dismissalReview)}
        review={dismissalReview}
        message={dismissalMessage}
        pending={dismissal.isPending}
        error={dismissalErrorMessage}
        onMessageChange={(message) => {
          dismissal.reset();
          setDismissalMessage(message);
        }}
        onConfirm={() => {
          if (!dismissalReview || !dismissalMessage.trim()) return;
          dismissal.mutate({ review: dismissalReview, message: dismissalMessage.trim() });
        }}
        onOpenChange={(next) => {
          if (next) return;
          dismissal.reset();
          setDismissalReview(null);
          setDismissalMessage("");
        }}
      />
    </>
  );
}

function ReviewerState({
  review,
  onDismiss,
}: {
  review: GitHubPullRequestReview;
  onDismiss: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex min-w-0 items-center gap-2 text-xs">
      <ReviewStateIcon state={review.state} />
      <span className="truncate">@{review.author}</span>
      <span className="text-muted-foreground ml-auto text-[9px]">
        {t(`workspace.repositories.reviewStates.${review.state}`)}
      </span>
      <GitHubPullRequestReviewDismissalMenu review={review} onSelect={onDismiss} />
    </div>
  );
}
