import { useMemo } from "react";
import { Diff, Hunk, parseDiff, type FileData, type ViewType } from "react-diff-view";
import "react-diff-view/style/index.css";
import { useTranslation } from "react-i18next";

export type GitHubPatchFile = {
  path: string;
  previousPath?: string;
  status: string;
  patch?: string;
};

export function parseGitHubFilePatch(file: GitHubPatchFile): FileData | null {
  if (!file.patch) return null;
  const oldPath = file.status === "added" ? "/dev/null" : `a/${file.previousPath ?? file.path}`;
  const newPath = file.status === "removed" ? "/dev/null" : `b/${file.path}`;
  const source = [
    `diff --git a/${file.previousPath ?? file.path} b/${file.path}`,
    `--- ${oldPath}`,
    `+++ ${newPath}`,
    file.patch,
  ].join("\n");

  try {
    const parsed = parseDiff(source, { nearbySequences: "zip" })[0];
    return parsed?.hunks.length ? parsed : null;
  } catch {
    return null;
  }
}

export function GitHubReadOnlyFileDiff({
  file,
  viewType,
}: {
  file: GitHubPatchFile;
  viewType: ViewType;
}) {
  const { t } = useTranslation();
  const diff = useMemo(() => parseGitHubFilePatch(file), [file]);

  if (!diff?.hunks.length) {
    return (
      <div className="text-muted-foreground bg-muted/20 px-4 py-8 text-center text-[11px]">
        {t(
          file.patch
            ? "workspace.repositories.commitPatchInvalid"
            : "workspace.repositories.commitPatchUnavailable"
        )}
      </div>
    );
  }

  return (
    <div className="harbor-diff min-w-0 overflow-x-auto">
      <Diff viewType={viewType} diffType={diff.type} hunks={diff.hunks} optimizeSelection>
        {(hunks) => hunks.map((hunk) => <Hunk key={hunk.content} hunk={hunk} />)}
      </Diff>
    </div>
  );
}
