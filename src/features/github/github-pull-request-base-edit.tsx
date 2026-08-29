import { useEffect, useMemo, useState } from "react";
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, CircleAlert, GitBranch, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
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
  DialogTrigger,
} from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { useAppTranslation } from "@/hooks/use-app-translation";
import { parseIpcError } from "@/lib/ipc-error";
import type {
  GitHubBranch,
  GitHubPullRequest,
  GitHubPullRequestBaseBranchPage,
  GitHubPullRequestRepository,
} from "./github-data";
import {
  invalidatePullRequestAfterBaseEdit,
  updateRepositoryPullRequestBase,
} from "./github-pull-request-mutations";
import { pullRequestBaseBranchesQueryOptions } from "./github-queries";

export function canChangePullRequestBase(pullRequest: GitHubPullRequest) {
  return pullRequest.state === "open" && !pullRequest.merged;
}

export function collectPullRequestBaseBranches(pages: GitHubPullRequestBaseBranchPage[]) {
  const first = pages[0];
  if (!first) return null;
  const consistent = pages.every(
    (page) =>
      page.pullRequestNumber === first.pullRequestNumber &&
      page.currentBase === first.currentBase &&
      page.currentBaseSha === first.currentBaseSha &&
      page.headSha === first.headSha
  );
  if (!consistent) return null;
  const branches = new Map<string, GitHubBranch>();
  for (const page of pages) {
    for (const branch of page.branches) {
      const existing = branches.get(branch.name);
      if (existing && existing.sha !== branch.sha) return null;
      branches.set(branch.name, branch);
    }
  }
  if (!branches.has(first.currentBase)) {
    branches.set(first.currentBase, {
      name: first.currentBase,
      sha: first.currentBaseSha,
      protected: false,
    });
  }
  return {
    pullRequestNumber: first.pullRequestNumber,
    currentBase: first.currentBase,
    currentBaseSha: first.currentBaseSha,
    headSha: first.headSha,
    branches: [...branches.values()].sort((left, right) => left.name.localeCompare(right.name)),
  };
}

export function pullRequestBaseBranchSnapshotRevision(
  snapshot: ReturnType<typeof collectPullRequestBaseBranches>
) {
  if (!snapshot) return "";
  return [
    snapshot.pullRequestNumber,
    snapshot.currentBase,
    snapshot.currentBaseSha,
    snapshot.headSha,
    ...snapshot.branches.flatMap((branch) => [branch.name, branch.sha]),
  ].join("\u0000");
}

export function shouldFetchNextPullRequestBaseBranchPage(value: {
  open: boolean;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  hasError: boolean;
  mutationPending: boolean;
}) {
  return (
    value.open &&
    value.hasNextPage &&
    !value.isFetchingNextPage &&
    !value.hasError &&
    !value.mutationPending
  );
}

export function canSubmitPullRequestBaseEdit(value: {
  selected: GitHubBranch | null;
  currentBase: string | undefined;
  snapshotMatchesDetail: boolean;
  pagesAreLoading: boolean;
  hasError: boolean;
}) {
  return Boolean(
    value.selected &&
    value.selected.name !== value.currentBase &&
    value.snapshotMatchesDetail &&
    !value.pagesAreLoading &&
    !value.hasError
  );
}

export function BaseBranchLoadError({
  error,
  disabled,
  onRetry,
}: {
  error: unknown;
  disabled: boolean;
  onRetry: () => void;
}) {
  const { t } = useAppTranslation();
  return (
    <Alert variant="destructive">
      <CircleAlert />
      <AlertTitle>{t("workspace.repositories.pullRequestBaseBranchesLoadFailed")}</AlertTitle>
      <AlertDescription className="flex flex-col items-start gap-2">
        <span>{parseIpcError(error).message}</span>
        <Button type="button" variant="outline" size="xs" disabled={disabled} onClick={onRetry}>
          {t("workspace.repositories.retry")}
        </Button>
      </AlertDescription>
    </Alert>
  );
}

export function BaseBranchLoading({ label }: { label: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="text-muted-foreground flex min-h-32 items-center justify-center gap-2 text-sm"
    >
      <Spinner role="presentation" aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}

export function GitHubPullRequestBaseEdit({
  repository,
  pullRequest,
}: {
  repository: GitHubPullRequestRepository;
  pullRequest: GitHubPullRequest;
}) {
  const { t } = useAppTranslation();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [targetName, setTargetName] = useState("");
  const target = {
    owner: repository.owner,
    repository: repository.name,
    pullRequestNumber: pullRequest.number,
  };
  const branchesQuery = useInfiniteQuery({
    ...pullRequestBaseBranchesQueryOptions(target),
    enabled: open,
  });
  const { error: branchesError, fetchNextPage, hasNextPage, isFetchingNextPage } = branchesQuery;
  const snapshot = useMemo(
    () => collectPullRequestBaseBranches(branchesQuery.data?.pages ?? []),
    [branchesQuery.data?.pages]
  );
  const snapshotRevision = pullRequestBaseBranchSnapshotRevision(snapshot);
  const snapshotMatchesDetail =
    snapshot?.pullRequestNumber === pullRequest.number &&
    snapshot.currentBase === pullRequest.baseRef &&
    snapshot.headSha === pullRequest.headSha;
  const selected = snapshot?.branches.find((branch) => branch.name === targetName) ?? null;
  const mutation = useMutation({
    mutationFn: () => {
      if (!snapshot || !selected) throw new Error("pull request base snapshot is unavailable");
      return updateRepositoryPullRequestBase(target, {
        expectedCurrentBase: snapshot.currentBase,
        expectedCurrentBaseSha: snapshot.currentBaseSha,
        expectedHeadSha: snapshot.headSha,
        targetBase: selected.name,
        expectedTargetBaseSha: selected.sha,
      });
    },
    onSuccess: () => {
      setOpen(false);
      setTargetName("");
      toast.success(t("workspace.repositories.pullRequestBaseChanged"));
      void invalidatePullRequestAfterBaseEdit(queryClient, target);
    },
    onError: () => {
      void invalidatePullRequestAfterBaseEdit(queryClient, target);
    },
  });
  useEffect(() => {
    if (
      shouldFetchNextPullRequestBaseBranchPage({
        open,
        hasNextPage,
        isFetchingNextPage,
        hasError: Boolean(branchesError),
        mutationPending: mutation.isPending,
      })
    ) {
      void fetchNextPage();
    }
  }, [open, hasNextPage, isFetchingNextPage, branchesError, fetchNextPage, mutation.isPending]);
  useEffect(() => {
    setTargetName("");
  }, [snapshotRevision]);
  if (!canChangePullRequestBase(pullRequest)) return null;
  const parsedError = mutation.error ? parseIpcError(mutation.error) : null;
  const mutationMessage = parsedError
    ? parsedError.code === "githubPermission"
      ? t("workspace.repositories.pullRequestWritePermissionDenied")
      : parsedError.code === "githubPullRequestBaseEditConflict"
        ? t("workspace.repositories.pullRequestBaseConflict")
        : parsedError.message
    : null;
  const setDialogOpen = (next: boolean) => {
    if (mutation.isPending) return;
    mutation.reset();
    setTargetName("");
    setOpen(next);
  };
  const refreshBaseState = () => {
    if (mutation.isPending) return;
    mutation.reset();
    setTargetName("");
    void invalidatePullRequestAfterBaseEdit(queryClient, target);
  };
  const pagesAreLoading = hasNextPage || isFetchingNextPage;
  const canConfirm = canSubmitPullRequestBaseEdit({
    selected,
    currentBase: snapshot?.currentBase,
    snapshotMatchesDetail,
    pagesAreLoading,
    hasError: Boolean(branchesError),
  });

  return (
    <Dialog open={open} onOpenChange={setDialogOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          <GitBranch data-icon="inline-start" />
          {t("workspace.repositories.changePullRequestBase")}
        </Button>
      </DialogTrigger>
      <DialogContent
        className="max-h-[calc(100vh-2rem)] overflow-y-auto sm:max-w-[560px]"
        showCloseButton={!mutation.isPending}
        aria-busy={mutation.isPending || pagesAreLoading || branchesQuery.isPending}
      >
        <DialogHeader>
          <DialogTitle>{t("workspace.repositories.changePullRequestBaseTitle")}</DialogTitle>
          <DialogDescription>
            {t("workspace.repositories.changePullRequestBaseDescription", {
              number: pullRequest.number,
            })}
          </DialogDescription>
        </DialogHeader>
        <Alert>
          <TriangleAlert />
          <AlertTitle>{t("workspace.repositories.changePullRequestBaseWarningTitle")}</AlertTitle>
          <AlertDescription>
            {t("workspace.repositories.changePullRequestBaseWarning")}
          </AlertDescription>
        </Alert>
        {branchesQuery.isPending && !snapshot ? (
          <BaseBranchLoading label={t("workspace.repositories.loadingBaseBranches")} />
        ) : branchesError ? (
          <BaseBranchLoadError
            error={branchesError}
            disabled={mutation.isPending}
            onRetry={() => {
              if (snapshot && hasNextPage) {
                void fetchNextPage();
              } else {
                void branchesQuery.refetch();
              }
            }}
          />
        ) : pagesAreLoading ? (
          <BaseBranchLoading label={t("workspace.repositories.loadingMoreBaseBranches")} />
        ) : !snapshot || !snapshotMatchesDetail ? (
          <Alert variant="destructive">
            <CircleAlert />
            <AlertTitle>{t("workspace.repositories.pullRequestBaseConflictTitle")}</AlertTitle>
            <AlertDescription className="flex flex-col items-start gap-2">
              <span>{t("workspace.repositories.pullRequestBaseConflict")}</span>
              <Button
                type="button"
                variant="outline"
                size="xs"
                disabled={mutation.isPending}
                onClick={refreshBaseState}
              >
                {t("workspace.repositories.refreshPullRequestBase")}
              </Button>
            </AlertDescription>
          </Alert>
        ) : (
          <>
            <Command className="rounded-md border">
              <CommandInput
                placeholder={t("workspace.repositories.searchBaseBranches")}
                disabled={mutation.isPending}
              />
              <CommandList className="max-h-64">
                <CommandEmpty>{t("workspace.repositories.noMatchingBaseBranches")}</CommandEmpty>
                <CommandGroup>
                  {snapshot.branches.map((branch) => {
                    const current = branch.name === snapshot.currentBase;
                    return (
                      <CommandItem
                        key={branch.name}
                        value={branch.name}
                        disabled={current || mutation.isPending}
                        onSelect={() => {
                          mutation.reset();
                          setTargetName(branch.name);
                        }}
                      >
                        <GitBranch />
                        <span className="min-w-0 flex-1 truncate">{branch.name}</span>
                        {branch.protected ? (
                          <Badge variant="outline">
                            {t("workspace.repositories.protectedBranch")}
                          </Badge>
                        ) : null}
                        {current ? (
                          <Badge variant="secondary">
                            {t("workspace.repositories.currentBase")}
                          </Badge>
                        ) : targetName === branch.name ? (
                          <Check className="ml-auto" />
                        ) : null}
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              </CommandList>
            </Command>
            {selected ? (
              <p className="bg-muted/45 rounded-md border px-3 py-2 text-xs">
                <code>{snapshot.currentBase}</code>
                <span className="text-muted-foreground mx-2">→</span>
                <code>{selected.name}</code>
              </p>
            ) : null}
          </>
        )}
        {mutationMessage ? (
          <Alert variant="destructive">
            <CircleAlert />
            <AlertTitle>{t("workspace.repositories.changePullRequestBaseFailed")}</AlertTitle>
            <AlertDescription>{mutationMessage}</AlertDescription>
          </Alert>
        ) : null}
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={mutation.isPending}
            onClick={() => setDialogOpen(false)}
          >
            {t("workspace.repositories.cancel")}
          </Button>
          <Button
            type="button"
            disabled={!canConfirm || mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? (
              <Spinner data-icon="inline-start" />
            ) : (
              <GitBranch data-icon="inline-start" />
            )}
            {t(
              mutation.isPending
                ? "workspace.repositories.changingPullRequestBase"
                : "workspace.repositories.changePullRequestBase"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
