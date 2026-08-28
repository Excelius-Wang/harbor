import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { BarChart3, CircleAlert, Vote } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldContent,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import { Progress } from "@/components/ui/progress";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { parseIpcError } from "@/lib/ipc-error";
import { openExternalUrl } from "@/lib/window";
import type { GitHubDiscussionPoll, GitHubRepositoryContentContext } from "./github-data";
import {
  addRepositoryDiscussionPollVote,
  syncDiscussionPoll,
  type GitHubDiscussionMutationTarget,
} from "./github-discussion-mutations";
import { githubQueryKeys } from "./github-queries";

const GitHubReadme = lazy(() => import("./github-readme"));

function pollPercentage(votes: number, totalVotes: number) {
  return totalVotes > 0 ? Math.round((votes / totalVotes) * 100) : 0;
}

export function GitHubDiscussionPollCard({
  repository,
  target,
  poll,
}: {
  repository: GitHubRepositoryContentContext;
  target: GitHubDiscussionMutationTarget;
  poll: GitHubDiscussionPoll;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const currentOptionId = useMemo(
    () => poll.options.find((option) => option.viewerHasVoted)?.id ?? "",
    [poll.options]
  );
  const [selectedOptionId, setSelectedOptionId] = useState(currentOptionId);
  const [showResults, setShowResults] = useState(poll.viewerHasVoted);
  useEffect(() => {
    setSelectedOptionId(currentOptionId);
    if (poll.viewerHasVoted) setShowResults(true);
  }, [currentOptionId, poll.id, poll.viewerHasVoted]);

  const mutation = useMutation({
    mutationFn: () => addRepositoryDiscussionPollVote(target, selectedOptionId),
    onSuccess: (updatedPoll) => {
      syncDiscussionPoll(queryClient, target, updatedPoll);
      setShowResults(true);
      toast.success(t("workspace.repositories.discussionPollVoteRecorded"));
      void queryClient.invalidateQueries({
        queryKey: githubQueryKeys.discussionDetail(target),
      });
    },
  });
  const error = mutation.error ? parseIpcError(mutation.error) : null;
  const changedSelection = Boolean(selectedOptionId && selectedOptionId !== currentOptionId);
  const canSubmit =
    poll.viewerCanVote &&
    Boolean(selectedOptionId) &&
    (!poll.viewerHasVoted || changedSelection) &&
    !mutation.isPending;

  return (
    <section className="bg-card/30 mt-4 overflow-hidden rounded-lg border">
      <header className="bg-card/40 flex min-h-11 items-center gap-2 border-b px-3.5 py-2 text-xs font-medium">
        <BarChart3 />
        {t("workspace.repositories.discussionPoll")}
      </header>
      <form
        className="p-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (canSubmit) mutation.mutate();
        }}
      >
        <FieldSet className="gap-4" disabled={mutation.isPending || !poll.viewerCanVote}>
          <FieldLegend>{poll.question}</FieldLegend>
          <RadioGroup
            value={selectedOptionId}
            disabled={mutation.isPending || !poll.viewerCanVote}
            onValueChange={(value) => {
              setSelectedOptionId(value);
              if (mutation.isError) mutation.reset();
            }}
          >
            {poll.options.map((option) => {
              const percentage = pollPercentage(option.totalVoteCount, poll.totalVoteCount);
              return (
                <Field
                  key={option.id}
                  orientation="horizontal"
                  data-disabled={mutation.isPending || !poll.viewerCanVote}
                  className="items-start rounded-md border p-3"
                >
                  <RadioGroupItem
                    id={`discussion-poll-${poll.id}-${option.id}`}
                    value={option.id}
                    className="mt-0.5"
                  />
                  <FieldContent className="min-w-0">
                    <FieldLabel
                      htmlFor={`discussion-poll-${poll.id}-${option.id}`}
                      className="w-full cursor-pointer"
                    >
                      <span className="harbor-markdown min-w-0 text-[12px] font-normal">
                        <Suspense fallback={<Skeleton className="h-4 w-2/3" />}>
                          <GitHubReadme
                            content={option.option}
                            inline
                            path=""
                            reference={repository.defaultBranch}
                            repository={repository}
                            onOpenExternal={(url) => void openExternalUrl(url)}
                          />
                        </Suspense>
                      </span>
                    </FieldLabel>
                    {showResults ? (
                      <div className="flex flex-col gap-1.5">
                        <div className="text-muted-foreground flex items-center justify-between gap-3 text-[10px]">
                          <span>
                            {t("workspace.repositories.discussionPollVotes", {
                              count: option.totalVoteCount,
                            })}
                          </span>
                          <span>{percentage}%</span>
                        </div>
                        <Progress
                          value={percentage}
                          aria-label={t("workspace.repositories.discussionPollOptionResult", {
                            option: option.option,
                            percentage,
                          })}
                        />
                      </div>
                    ) : null}
                  </FieldContent>
                </Field>
              );
            })}
          </RadioGroup>
          {error ? (
            <Alert variant="destructive">
              <CircleAlert />
              <AlertTitle>{t("workspace.repositories.discussionPollVoteFailed")}</AlertTitle>
              <AlertDescription>
                {error.code === "githubPermission"
                  ? t("workspace.repositories.discussionWritePermissionDenied")
                  : error.message}
              </AlertDescription>
            </Alert>
          ) : null}
          <FieldGroup className="gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <Button type="submit" size="sm" disabled={!canSubmit}>
                {mutation.isPending ? (
                  <Spinner data-icon="inline-start" />
                ) : (
                  <Vote data-icon="inline-start" />
                )}
                {t(
                  mutation.isPending
                    ? "workspace.repositories.recordingDiscussionPollVote"
                    : poll.viewerHasVoted
                      ? "workspace.repositories.changeDiscussionPollVote"
                      : "workspace.repositories.voteInDiscussionPoll"
                )}
              </Button>
              {!poll.viewerHasVoted ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowResults((value) => !value)}
                >
                  {t(
                    showResults
                      ? "workspace.repositories.hideDiscussionPollResults"
                      : "workspace.repositories.showDiscussionPollResults"
                  )}
                </Button>
              ) : null}
              <span className="text-muted-foreground ml-auto text-[10px]">
                {t("workspace.repositories.discussionPollTotalVotes", {
                  count: poll.totalVoteCount,
                })}
              </span>
            </div>
          </FieldGroup>
        </FieldSet>
      </form>
    </section>
  );
}
