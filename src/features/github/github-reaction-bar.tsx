import { RefreshCw, SmilePlus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { GitHubReactionContent, GitHubReactionSubjectRef } from "./github-data";
import { useGitHubReactions } from "./github-reactions-provider";

const REACTIONS: Array<{ content: GitHubReactionContent; emoji: string }> = [
  { content: "thumbsUp", emoji: "👍" },
  { content: "thumbsDown", emoji: "👎" },
  { content: "laugh", emoji: "😄" },
  { content: "hooray", emoji: "🎉" },
  { content: "confused", emoji: "😕" },
  { content: "heart", emoji: "❤️" },
  { content: "rocket", emoji: "🚀" },
  { content: "eyes", emoji: "👀" },
];

function supportedReactions(subject: GitHubReactionSubjectRef) {
  return subject.kind === "release"
    ? REACTIONS.filter(
        (reaction) => reaction.content !== "thumbsDown" && reaction.content !== "confused"
      )
    : REACTIONS;
}

export function GitHubReactionBar({
  subject,
  className,
}: {
  subject: GitHubReactionSubjectRef;
  className?: string;
}) {
  const { t } = useTranslation();
  const reactions = useGitHubReactions();
  if (!reactions) return null;
  const current = reactions.subject(subject);

  if (!current && reactions.loading) {
    return <Skeleton className={cn("h-7 w-20", className)} />;
  }
  if (!current && reactions.error) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            className={className}
            aria-label={t("workspace.repositories.reactions.retry")}
            onClick={reactions.retry}
          >
            <RefreshCw />
          </Button>
        </TooltipTrigger>
        <TooltipContent>{t("workspace.repositories.reactions.loadFailed")}</TooltipContent>
      </Tooltip>
    );
  }
  if (!current) return null;

  const available = supportedReactions(subject);
  const visibleGroups = available.flatMap((reaction) => {
    const group = current.groups.find((group) => group.content === reaction.content);
    return group && group.count > 0 ? [{ ...reaction, group }] : [];
  });
  if (!visibleGroups.length && !current.viewerCanReact) return null;

  return (
    <div className={cn("flex min-w-0 flex-wrap items-center gap-1", className)}>
      {visibleGroups.map(({ content, emoji, group }) => {
        const canToggle = current.viewerCanReact || group.viewerHasReacted;
        return (
          <Tooltip key={content}>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant={group.viewerHasReacted ? "secondary" : "outline"}
                size="xs"
                className="h-7 min-w-10 px-2"
                aria-pressed={group.viewerHasReacted}
                aria-label={t(
                  group.viewerHasReacted
                    ? "workspace.repositories.reactions.toggleLabelSelected"
                    : "workspace.repositories.reactions.toggleLabel",
                  {
                    reaction: t(`workspace.repositories.reactions.names.${content}`),
                    count: group.count,
                  }
                )}
                disabled={!canToggle || reactions.pending}
                onClick={() => reactions.toggle(subject, content)}
              >
                <span aria-hidden="true">{emoji}</span>
                <span>{group.count}</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {t(`workspace.repositories.reactions.names.${content}`)}
            </TooltipContent>
          </Tooltip>
        );
      })}

      {current.viewerCanReact ? (
        <DropdownMenu>
          <Tooltip>
            <TooltipTrigger asChild>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  aria-label={t("workspace.repositories.reactions.add")}
                  disabled={reactions.pending}
                >
                  <SmilePlus />
                </Button>
              </DropdownMenuTrigger>
            </TooltipTrigger>
            <TooltipContent>{t("workspace.repositories.reactions.add")}</TooltipContent>
          </Tooltip>
          <DropdownMenuContent align="start" className="min-w-44">
            <DropdownMenuGroup>
              {available.map(({ content, emoji }) => {
                const selected = current.groups.some(
                  (group) => group.content === content && group.viewerHasReacted
                );
                return (
                  <DropdownMenuCheckboxItem
                    key={content}
                    checked={selected}
                    disabled={reactions.pending}
                    onCheckedChange={() => reactions.toggle(subject, content)}
                  >
                    <span aria-hidden="true">{emoji}</span>
                    <span>{t(`workspace.repositories.reactions.names.${content}`)}</span>
                  </DropdownMenuCheckboxItem>
                );
              })}
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </div>
  );
}
