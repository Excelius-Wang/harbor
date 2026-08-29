import { lazy, Suspense } from "react";
import { CircleDotDashed, UserRound } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { openExternalUrl } from "@/lib/window";
import type {
  GitHubIssue,
  GitHubIssueTimelineItem,
  GitHubPullRequest,
  GitHubPullRequestReviewState,
  GitHubReactionSubjectRef,
  GitHubRepositoryContentContext,
} from "./github-data";
import { GitHubReactionBar } from "./github-reaction-bar";
import { GitHubReactionsProvider } from "./github-reactions-provider";
import { formatIssueDate, GitHubIssuePagination } from "./github-issue-shared";

const GitHubReadme = lazy(() => import("./github-readme"));

function TimelineEvent({ item, locale }: { item: GitHubIssueTimelineItem; locale: string }) {
  const { t } = useTranslation();
  const actor = item.actor ? `@${item.actor}` : t("workspace.repositories.unknownActor");
  const eventKey = item.event.replace(/[-_]([a-z])/g, (_, letter: string) => letter.toUpperCase());
  const detail = item.assignee
    ? `@${item.assignee}`
    : (item.label?.name ??
      item.milestone ??
      (item.renameFrom && item.renameTo ? `${item.renameFrom} → ${item.renameTo}` : undefined));

  return (
    <div className="relative flex gap-3 py-2 pl-1">
      <span className="bg-background relative z-10 grid size-7 shrink-0 place-items-center rounded-full border">
        <CircleDotDashed className="text-muted-foreground size-3.5" />
      </span>
      <p className="text-muted-foreground min-w-0 pt-1 text-[11px] leading-5">
        <span className="text-foreground/85 font-medium">{actor}</span>{" "}
        {t(`workspace.repositories.issueEvents.${eventKey}`, {
          detail,
          defaultValue: t("workspace.repositories.issueEvent", {
            event: item.event.replace(/[-_]/g, " "),
            detail,
          }),
        })}
        {item.createdAt ? (
          <span className="ml-2 text-[10px]">{formatIssueDate(item.createdAt, locale)}</span>
        ) : null}
      </p>
    </div>
  );
}

function ConversationCard({
  actor,
  avatarUrl,
  association,
  body,
  createdAt,
  repository,
  locale,
  emptyBody,
  reviewState,
  reactionSubject,
}: {
  actor: string;
  avatarUrl?: string;
  association?: string;
  body?: string;
  createdAt?: string;
  repository: GitHubRepositoryContentContext;
  locale: string;
  emptyBody: string;
  reviewState?: GitHubPullRequestReviewState;
  reactionSubject?: GitHubReactionSubjectRef;
}) {
  const { t } = useTranslation();
  return (
    <article className="bg-card/30 overflow-hidden rounded-lg border">
      <header className="bg-card/40 flex min-h-11 items-center gap-2 border-b px-3.5 py-2">
        <Avatar size="sm">
          {avatarUrl ? <AvatarImage src={avatarUrl} alt="" /> : null}
          <AvatarFallback>
            <UserRound />
          </AvatarFallback>
        </Avatar>
        <span className="text-foreground/90 text-xs font-medium">@{actor}</span>
        <span className="text-muted-foreground text-[10px]">
          {reviewState
            ? t("workspace.repositories.reviewedAt", {
                state: t(`workspace.repositories.reviewStates.${reviewState}`),
                date: formatIssueDate(createdAt, locale),
              })
            : t("workspace.repositories.commentedAt", {
                date: formatIssueDate(createdAt, locale),
              })}
        </span>
        {reviewState ? (
          <Badge variant="outline" className="ml-auto h-5 rounded-md text-[9px] font-normal">
            {t(`workspace.repositories.reviewStates.${reviewState}`)}
          </Badge>
        ) : null}
        {association ? (
          <Badge
            variant="outline"
            className={
              reviewState
                ? "h-5 rounded-md text-[9px] font-normal"
                : "ml-auto h-5 rounded-md text-[9px] font-normal"
            }
          >
            {association.toLowerCase()}
          </Badge>
        ) : null}
      </header>
      <div className="harbor-markdown min-h-20 px-4 py-4 text-[12px]">
        {body ? (
          <Suspense fallback={<Skeleton className="h-16 w-full" />}>
            <GitHubReadme
              content={body}
              path=""
              reference={repository.defaultBranch}
              repository={repository}
              onOpenExternal={(url) => void openExternalUrl(url)}
            />
          </Suspense>
        ) : (
          <p className="text-muted-foreground">{emptyBody}</p>
        )}
      </div>
      {reactionSubject ? (
        <footer className="flex min-h-10 items-center border-t px-3 py-1.5">
          <GitHubReactionBar subject={reactionSubject} />
        </footer>
      ) : null}
    </article>
  );
}

export function GitHubIssueTimeline({
  issue,
  timeline,
  repository,
  locale,
  page,
  hasPrevious,
  hasMore,
  onPageChange,
  emptyBody,
}: {
  issue: Pick<
    GitHubIssue | GitHubPullRequest,
    "author" | "authorAvatarUrl" | "authorAssociation" | "body" | "createdAt" | "reactionSubject"
  >;
  timeline: GitHubIssueTimelineItem[];
  repository: GitHubRepositoryContentContext;
  locale: string;
  page: number;
  hasPrevious: boolean;
  hasMore: boolean;
  onPageChange: (page: number) => void;
  emptyBody?: string;
}) {
  const { t } = useTranslation();
  const emptyBodyText = emptyBody ?? t("workspace.repositories.noIssueBody");
  const reactionSubjects = [
    issue.reactionSubject,
    ...timeline.map((item) => item.reactionSubject),
  ].filter((subject): subject is GitHubReactionSubjectRef => Boolean(subject));
  return (
    <GitHubReactionsProvider repository={repository} subjects={reactionSubjects}>
      <div className="before:bg-border relative flex min-w-0 flex-col gap-3 before:absolute before:top-8 before:bottom-4 before:left-[13px] before:w-px">
        <div className="relative z-10 pl-10">
          <ConversationCard
            actor={issue.author}
            avatarUrl={issue.authorAvatarUrl}
            association={issue.authorAssociation}
            body={issue.body}
            createdAt={issue.createdAt}
            repository={repository}
            locale={locale}
            emptyBody={emptyBodyText}
            reactionSubject={issue.reactionSubject}
          />
        </div>
        {timeline.map((item) =>
          item.kind === "comment" && item.actor && item.createdAt ? (
            <div key={item.id} className="relative z-10 pl-10">
              <ConversationCard
                actor={item.actor}
                avatarUrl={item.actorAvatarUrl}
                association={item.authorAssociation}
                body={item.body}
                createdAt={item.createdAt}
                repository={repository}
                locale={locale}
                emptyBody={emptyBodyText}
                reactionSubject={item.reactionSubject}
              />
            </div>
          ) : item.event === "reviewed" && item.actor && item.createdAt ? (
            <div key={item.id} className="relative z-10 pl-10">
              <ConversationCard
                actor={item.actor}
                avatarUrl={item.actorAvatarUrl}
                association={item.authorAssociation}
                body={item.body}
                createdAt={item.createdAt}
                repository={repository}
                locale={locale}
                emptyBody={t("workspace.repositories.reviewWithoutBody")}
                reviewState={item.reviewState ?? "commented"}
                reactionSubject={item.reactionSubject}
              />
            </div>
          ) : (
            <TimelineEvent key={item.id} item={item} locale={locale} />
          )
        )}
        <GitHubIssuePagination
          page={page}
          hasPrevious={hasPrevious}
          hasMore={hasMore}
          onPageChange={onPageChange}
        />
      </div>
    </GitHubReactionsProvider>
  );
}
