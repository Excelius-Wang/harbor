import { BadgeCheck, ExternalLink, UserRound } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { openExternalUrl } from "@/lib/window";
import type { GitHubCommit } from "./github-data";
import { formatIssueDate } from "./github-issue-shared";

export function GitHubCommitList({ commits }: { commits: GitHubCommit[] }) {
  const { t, i18n } = useTranslation();

  return (
    <div className="overflow-hidden rounded-lg border">
      {commits.map((commit) => (
        <article
          key={commit.sha}
          className="hover:bg-accent/30 flex min-w-0 items-start gap-3 border-b px-4 py-3.5 last:border-b-0"
        >
          <Avatar size="sm" className="mt-0.5 shrink-0">
            {commit.authorAvatarUrl ? <AvatarImage src={commit.authorAvatarUrl} alt="" /> : null}
            <AvatarFallback>
              <UserRound />
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <p className="text-foreground/95 text-[13px] leading-5 font-medium">{commit.title}</p>
            <div className="text-muted-foreground mt-1 flex flex-wrap items-center gap-2 text-[10px]">
              <span>{commit.authorLogin ? `@${commit.authorLogin}` : commit.author}</span>
              {commit.committedAt ? (
                <span>{formatIssueDate(commit.committedAt, i18n.language)}</span>
              ) : null}
              {commit.verified ? (
                <Badge variant="outline" className="text-success h-5 rounded-md text-[9px]">
                  <BadgeCheck /> {t("workspace.repositories.verified")}
                </Badge>
              ) : null}
            </div>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="xs"
            className="shrink-0 font-mono"
            onClick={() => void openExternalUrl(commit.url)}
          >
            {commit.shortSha}
            <ExternalLink data-icon="inline-end" />
          </Button>
        </article>
      ))}
    </div>
  );
}
