import { lazy, Suspense, type ReactNode } from "react";
import { ChevronDown, CircleDotDashed, UserRound } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Skeleton } from "@/components/ui/skeleton";
import { openExternalUrl } from "@/lib/window";
import type {
  GitHubIssue,
  GitHubIssueTimelineItem,
  GitHubPullRequest,
  GitHubPullRequestReviewState,
  GitHubRepositoryContentContext,
} from "./github-data";
import {
  GitHubConversationCommentActions,
  type GitHubConversationCommentTarget,
} from "./github-conversation-comment-actions";
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
  headerActions,
  isMinimized = false,
  minimizedReason,
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
  headerActions?: ReactNode;
  isMinimized?: boolean;
  minimizedReason?: string;
}) {
  const { t } = useTranslation();
  return (
    <article className="bg-card/30 overflow-hidden rounded-lg border">
      <header className="bg-card/40 flex min-h-11 min-w-0 items-center gap-2 border-b px-3.5 py-2">
        <Avatar size="sm">
          {avatarUrl ? <AvatarImage src={avatarUrl} alt="" /> : null}
          <AvatarFallback>
            <UserRound />
          </AvatarFallback>
        </Avatar>
        <span className="text-foreground/90 min-w-0 truncate text-xs font-medium">@{actor}</span>
        <span className="text-muted-foreground shrink-0 text-[10px]">
          {reviewState
            ? t("workspace.repositories.reviewedAt", {
                state: t(`workspace.repositories.reviewStates.${reviewState}`),
                date: formatIssueDate(createdAt, locale),
              })
            : t("workspace.repositories.commentedAt", {
                date: formatIssueDate(createdAt, locale),
              })}
        </span>
        <span className="ml-auto flex shrink-0 items-center gap-1">
          {reviewState ? (
            <Badge variant="outline" className="h-5 rounded-md text-[9px] font-normal">
              {t(`workspace.repositories.reviewStates.${reviewState}`)}
            </Badge>
          ) : null}
          {association ? (
            <Badge variant="outline" className="h-5 rounded-md text-[9px] font-normal">
              {association.toLowerCase()}
            </Badge>
          ) : null}
          {headerActions}
        </span>
      </header>
      <Collapsible defaultOpen={!isMinimized}>
        {isMinimized ? (
          <CollapsibleTrigger asChild>
            <Button type="button" variant="ghost" size="sm" className="m-2">
              <ChevronDown data-icon="inline-start" />
              {minimizedReason
                ? t("workspace.repositories.commentMinimizedReason", {
                    reason: minimizedReason,
                  })
                : t("workspace.repositories.commentMinimized")}
            </Button>
          </CollapsibleTrigger>
        ) : null}
        <CollapsibleContent>
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
        </CollapsibleContent>
      </Collapsible>
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
  commentTarget,
  emptyBody,
}: {
  issue: Pick<
    GitHubIssue | GitHubPullRequest,
    "author" | "authorAvatarUrl" | "authorAssociation" | "body" | "createdAt"
  >;
  timeline: GitHubIssueTimelineItem[];
  repository: GitHubRepositoryContentContext;
  locale: string;
  page: number;
  hasPrevious: boolean;
  hasMore: boolean;
  onPageChange: (page: number) => void;
  commentTarget: GitHubConversationCommentTarget;
  emptyBody?: string;
}) {
  const { t } = useTranslation();
  const emptyBodyText = emptyBody ?? t("workspace.repositories.noIssueBody");
  return (
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
              isMinimized={item.isMinimized}
              minimizedReason={item.minimizedReason}
              headerActions={
                <GitHubConversationCommentActions
                  comment={item}
                  target={commentTarget}
                  repository={repository}
                />
              }
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
  );
}
