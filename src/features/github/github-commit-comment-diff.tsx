import { useMemo, useState } from "react";
import { MessageSquarePlus } from "lucide-react";
import { Diff, Hunk, getChangeKey, type ChangeData, type ViewType } from "react-diff-view";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import type {
  GitHubChangedFile,
  GitHubCommitComment,
  GitHubRepositoryContentContext,
} from "./github-data";
import { GitHubCommitCommentCard } from "./github-commit-comment-card";
import { GitHubCommitCommentComposer } from "./github-commit-comment-composer";
import {
  commitCommentChangeKeyForFile,
  commitCommentPositionsByChangeKey,
} from "./github-commit-comment-position";
import { GitHubReadOnlyFileDiff, parseGitHubFilePatch } from "./github-file-diff";
import type { GitHubCommitDetailTarget } from "./github-queries";

function preferredCommentSide(change: ChangeData) {
  return change.type === "delete" ? "old" : "new";
}

function displayedLine(change: ChangeData) {
  if (change.type === "insert" || change.type === "delete") return change.lineNumber;
  return change.newLineNumber;
}

export function GitHubCommitCommentFileDiff({
  file,
  viewType,
  target,
  repository,
  comments,
  canCreateComment,
}: {
  file: GitHubChangedFile;
  viewType: ViewType;
  target: GitHubCommitDetailTarget;
  repository: GitHubRepositoryContentContext;
  comments: GitHubCommitComment[];
  canCreateComment: boolean;
}) {
  const { t } = useTranslation();
  const [openPosition, setOpenPosition] = useState<number | null>(null);
  const diff = useMemo(() => parseGitHubFilePatch(file), [file]);
  const changes = useMemo(() => diff?.hunks.flatMap((hunk) => hunk.changes) ?? [], [diff]);
  const positions = useMemo(
    () => commitCommentPositionsByChangeKey(file, changes),
    [changes, file]
  );
  const commentsByChange = useMemo(
    () =>
      comments.reduce((grouped, comment) => {
        const changeKey = commitCommentChangeKeyForFile(file, comment, positions);
        if (!changeKey) return grouped;
        const existing = grouped.get(changeKey);
        if (existing) existing.push(comment);
        else grouped.set(changeKey, [comment]);
        return grouped;
      }, new Map<string, GitHubCommitComment[]>()),
    [comments, file, positions]
  );

  if (!diff?.hunks.length || !positions.size) {
    return <GitHubReadOnlyFileDiff file={file} viewType={viewType} />;
  }

  const widgets = Object.fromEntries(
    changes.flatMap((change) => {
      const changeKey = getChangeKey(change);
      const position = positions.get(changeKey);
      const changeComments = commentsByChange.get(changeKey) ?? [];
      const composerOpen = position !== undefined && openPosition === position;
      if (!changeComments.length && !composerOpen) return [];
      return [
        [
          changeKey,
          <div key={`${file.path}:${changeKey}`} className="flex min-w-0 flex-col gap-2 p-2">
            {changeComments.map((comment) => (
              <GitHubCommitCommentCard
                key={comment.id}
                target={target}
                repository={repository}
                comment={comment}
                compact
              />
            ))}
            {composerOpen && position !== undefined ? (
              <GitHubCommitCommentComposer
                target={target}
                repository={repository}
                placement={{ path: file.path, position }}
                className="m-0 rounded-md"
                onCreated={() => setOpenPosition(null)}
              />
            ) : null}
          </div>,
        ],
      ];
    })
  );
  const selectedChanges = changes
    .filter((change) => {
      const changeKey = getChangeKey(change);
      const position = positions.get(changeKey);
      return (commentsByChange.get(changeKey)?.length ?? 0) > 0 || position === openPosition;
    })
    .map(getChangeKey);

  return (
    <div className="harbor-diff min-w-0 overflow-x-auto">
      <Diff
        viewType={viewType}
        diffType={diff.type}
        hunks={diff.hunks}
        optimizeSelection
        widgets={widgets}
        selectedChanges={selectedChanges}
        renderGutter={({ change, side, renderDefault, wrapInAnchor }) => {
          const changeKey = getChangeKey(change);
          const position = positions.get(changeKey);
          const commentable =
            canCreateComment && position !== undefined && side === preferredCommentSide(change);
          return (
            <span className="group flex min-w-9 items-center justify-end gap-1 px-1">
              {commentable ? (
                <Button
                  type="button"
                  size="icon-xs"
                  className="size-4 rounded-sm opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                  aria-label={t("workspace.repositories.commentOnLine", {
                    line: displayedLine(change),
                  })}
                  onClick={() =>
                    setOpenPosition((current) => (current === position ? null : position))
                  }
                >
                  <MessageSquarePlus />
                </Button>
              ) : null}
              {wrapInAnchor(renderDefault())}
            </span>
          );
        }}
      >
        {(hunks) => hunks.map((hunk) => <Hunk key={hunk.content} hunk={hunk} />)}
      </Diff>
    </div>
  );
}
