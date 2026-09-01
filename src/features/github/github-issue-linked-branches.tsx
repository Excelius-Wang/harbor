import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CircleAlert, GitBranch, RefreshCw, Unlink } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { useAppTranslation } from "@/hooks/use-app-translation";
import { parseIpcError } from "@/lib/ipc-error";
import type {
  GitHubIssue,
  GitHubIssueLinkedBranch,
  GitHubRepositoryContentContext,
} from "./github-data";
import {
  createRepositoryIssueLinkedBranch,
  deleteRepositoryIssueLinkedBranch,
  invalidateIssueLinkedBranches,
  issueLinkedBranchQueryOptions,
  syncIssueLinkedBranches,
} from "./github-issue-linked-branch-queries";
import { invalidateRepositoryIssue } from "./github-issue-mutations";
import { GitHubIssueRelationLoadError } from "./github-issue-relation-ui";
import { GitHubPagination } from "./github-issue-shared";

function LinkedBranchesSkeleton() {
  return (
    <Card className="gap-3 py-4 shadow-none">
      <CardHeader className="px-4">
        <div className="flex items-center justify-between gap-2">
          <div className="bg-muted h-4 w-32 animate-pulse rounded" />
          <div className="bg-muted h-7 w-24 animate-pulse rounded" />
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-2 px-4">
        <div className="bg-muted h-10 w-full animate-pulse rounded" />
        <div className="bg-muted h-10 w-full animate-pulse rounded" />
      </CardContent>
    </Card>
  );
}

function branchTarget(repository: GitHubRepositoryContentContext, issue: GitHubIssue) {
  return {
    owner: repository.owner,
    repository: repository.name,
    issueNumber: issue.number,
    expectedIssueNodeId: issue.reactionSubject.id,
  };
}

function LinkedBranchRow({
  branch,
  canUnlink,
  pending,
  onUnlink,
}: {
  branch: GitHubIssueLinkedBranch;
  canUnlink: boolean;
  pending: boolean;
  onUnlink: () => void;
}) {
  const { t } = useAppTranslation();
  return (
    <div className="hover:bg-accent/30 flex min-w-0 items-center gap-2 rounded-md px-2.5 py-2">
      <GitBranch data-icon="inline-start" className="text-muted-foreground" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs font-medium">{branch.name}</span>
        <span className="text-muted-foreground block truncate text-[10px] font-normal">
          {branch.repositoryFullName} · {branch.oid.slice(0, 7)}
        </span>
      </span>
      {canUnlink ? (
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          disabled={pending}
          aria-label={t("workspace.repositories.unlinkLinkedBranch")}
          onClick={onUnlink}
        >
          {pending ? <Spinner /> : <Unlink />}
        </Button>
      ) : null}
    </div>
  );
}

export function GitHubIssueLinkedBranches({
  repository,
  issue,
}: {
  repository: GitHubRepositoryContentContext;
  issue: GitHubIssue;
}) {
  const { t } = useAppTranslation();
  const queryClient = useQueryClient();
  const [cursors, setCursors] = useState<(string | null)[]>([null]);
  const [createOpen, setCreateOpen] = useState(false);
  const [branchName, setBranchName] = useState("");
  const currentRepository = `${repository.owner}/${repository.name}`;
  const [branchRepository, setBranchRepository] = useState(currentRepository);
  const destinationRepository = branchRepository.trim() || currentRepository;
  const hasExplicitDestination =
    destinationRepository.toLowerCase() !== currentRepository.toLowerCase();
  const [submitted, setSubmitted] = useState(false);
  const [unlinkCandidate, setUnlinkCandidate] = useState<GitHubIssueLinkedBranch | null>(null);
  const target = branchTarget(repository, issue);
  const after = cursors[cursors.length - 1] ?? null;
  const pageNumber = cursors.length;
  const result = useQuery(issueLinkedBranchQueryOptions({ ...target, after }));

  const refresh = () =>
    Promise.all([
      invalidateIssueLinkedBranches(queryClient, target),
      invalidateRepositoryIssue(queryClient, target),
    ]);
  const createMutation = useMutation({
    mutationFn: () =>
      createRepositoryIssueLinkedBranch(
        target,
        result.data?.defaultBranchOid ?? "",
        branchName.trim() || null,
        hasExplicitDestination ? destinationRepository : null
      ),
    onSuccess: (page) => {
      syncIssueLinkedBranches(queryClient, target, page);
      setCreateOpen(false);
      setBranchName("");
      setBranchRepository(currentRepository);
      setSubmitted(false);
      setCursors([null]);
      toast.success(t("workspace.repositories.linkedBranchCreated"));
      void refresh();
    },
    onError: () => void refresh(),
  });
  const deleteMutation = useMutation({
    mutationFn: () => deleteRepositoryIssueLinkedBranch(target, unlinkCandidate!),
    onSuccess: (page) => {
      syncIssueLinkedBranches(queryClient, target, page);
      setUnlinkCandidate(null);
      toast.success(t("workspace.repositories.linkedBranchUnlinked"));
      void refresh();
    },
    onError: () => void refresh(),
  });
  const error = result.error ? parseIpcError(result.error) : null;
  const mutationError = createMutation.error
    ? parseIpcError(createMutation.error)
    : deleteMutation.error
      ? parseIpcError(deleteMutation.error)
      : null;
  const branchExists = Boolean(
    result.data?.branches.some(
      (branch) =>
        branch.name === branchName.trim() &&
        branch.repositoryFullName.toLowerCase() === destinationRepository.toLowerCase()
    )
  );
  const branchInvalid = submitted && branchExists;
  const mutationErrorMessage = (mutation: ReturnType<typeof parseIpcError>) =>
    mutation.code === "githubPermission"
      ? t("workspace.repositories.issueWritePermissionDenied")
      : mutation.code === "githubRateLimited"
        ? t("workspace.repositories.githubRateLimited")
        : mutation.message;
  const createMutationErrorMessage = (mutation: ReturnType<typeof parseIpcError>) =>
    mutation.code === "githubPermission"
      ? t("workspace.repositories.linkedBranchDestinationPermissionDenied")
      : mutationErrorMessage(mutation);
  const relationErrorTitle = (relationError: ReturnType<typeof parseIpcError> | null) =>
    relationError?.code === "githubPermission"
      ? t("workspace.repositories.issueLinkedBranchesPermissionDenied")
      : relationError?.code === "githubRateLimited"
        ? t("workspace.repositories.githubRateLimited")
        : t("workspace.repositories.issueLinkedBranchesLoadFailed");
  const relationErrorMessage = (relationError: ReturnType<typeof parseIpcError> | null) =>
    relationError?.code === "githubRateLimited"
      ? t("workspace.repositories.githubRateLimited")
      : undefined;

  if (!issue.reactionSubject.id.trim()) return null;
  if (result.isPending) return <LinkedBranchesSkeleton />;
  if (!result.data) {
    return (
      <GitHubIssueRelationLoadError
        title={relationErrorTitle(error)}
        error={error}
        message={relationErrorMessage(error)}
        onRetry={() => void result.refetch()}
      />
    );
  }

  const page = result.data;
  const changePage = (nextPage: number) => {
    if (nextPage < pageNumber) setCursors((current) => current.slice(0, -1));
    if (nextPage === pageNumber + 1 && page.nextCursor) {
      setCursors((current) => [...current, page.nextCursor!]);
    }
  };

  return (
    <>
      <Card className="gap-0 overflow-hidden py-0 shadow-none" aria-busy={result.isFetching}>
        <CardHeader className="border-b px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <CardTitle className="flex items-center gap-2 text-xs">
              <GitBranch className="text-muted-foreground size-3.5" />
              {t("workspace.repositories.linkedBranches")}
              {result.isFetching ? (
                <RefreshCw className="text-muted-foreground size-3 animate-spin" />
              ) : null}
            </CardTitle>
            {page.viewerCanCreate || page.viewerCanRead ? (
              <Button
                type="button"
                variant="outline"
                size="xs"
                onClick={() => {
                  createMutation.reset();
                  setBranchName("");
                  setBranchRepository(currentRepository);
                  setSubmitted(false);
                  setCreateOpen(true);
                }}
              >
                <GitBranch data-icon="inline-start" />
                {t("workspace.repositories.createLinkedBranch")}
              </Button>
            ) : null}
          </div>
        </CardHeader>
        <CardContent className="px-1.5 py-1.5">
          {error ? (
            <div className="px-1.5 pt-1.5">
              <GitHubIssueRelationLoadError
                title={relationErrorTitle(error)}
                error={error}
                message={relationErrorMessage(error)}
                onRetry={() => void result.refetch()}
              />
            </div>
          ) : null}
          {page.branches.length === 0 ? (
            <Empty className="min-h-0 gap-2 px-4 py-5 md:p-5">
              <EmptyHeader className="gap-1">
                <EmptyTitle className="text-xs">
                  {t("workspace.repositories.noLinkedBranches")}
                </EmptyTitle>
                <EmptyDescription className="text-[11px]">
                  {t("workspace.repositories.noLinkedBranchesDescription")}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <div className="flex flex-col gap-0.5">
              {page.branches.map((branch) => (
                <LinkedBranchRow
                  key={branch.id}
                  branch={branch}
                  canUnlink={page.viewerCanCreate}
                  pending={deleteMutation.isPending && unlinkCandidate?.id === branch.id}
                  onUnlink={() => {
                    deleteMutation.reset();
                    setUnlinkCandidate(branch);
                  }}
                />
              ))}
            </div>
          )}
        </CardContent>
        <GitHubPagination
          page={pageNumber}
          hasPrevious={pageNumber > 1}
          hasMore={Boolean(page.nextCursor)}
          onPageChange={changePage}
          ariaLabel={t("workspace.repositories.linkedBranchPagination")}
        />
      </Card>

      <Dialog
        open={createOpen}
        onOpenChange={(open) => !createMutation.isPending && setCreateOpen(open)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {t("workspace.repositories.createLinkedBranchTitle", { number: issue.number })}
            </DialogTitle>
            <DialogDescription>
              {t("workspace.repositories.createLinkedBranchDescription", {
                base: !hasExplicitDestination
                  ? `${currentRepository} (${page.defaultBranch}, ${page.defaultBranchOid.slice(0, 7)})`
                  : destinationRepository,
              })}
            </DialogDescription>
          </DialogHeader>
          <form
            id="github-issue-linked-branch-form"
            onSubmit={(event) => {
              event.preventDefault();
              setSubmitted(true);
              if (branchInvalid || createMutation.isPending) return;
              createMutation.mutate();
            }}
          >
            <FieldGroup>
              <Field data-invalid={branchInvalid} data-disabled={createMutation.isPending}>
                <FieldLabel htmlFor="github-issue-linked-branch-name">
                  {t("workspace.repositories.linkedBranchName")}
                </FieldLabel>
                <Input
                  id="github-issue-linked-branch-name"
                  value={branchName}
                  autoFocus
                  autoComplete="off"
                  spellCheck={false}
                  aria-invalid={branchInvalid}
                  disabled={createMutation.isPending}
                  placeholder={t("workspace.repositories.linkedBranchNamePlaceholder")}
                  onChange={(event) => setBranchName(event.target.value)}
                />
                <FieldDescription>
                  {t("workspace.repositories.linkedBranchNameDescription")}
                </FieldDescription>
                <FieldError>
                  {branchInvalid ? t("workspace.repositories.branchAlreadyExists") : null}
                </FieldError>
              </Field>
              <Field data-disabled={createMutation.isPending}>
                <FieldLabel htmlFor="github-issue-linked-branch-repository">
                  {t("workspace.repositories.linkedBranchRepository")}
                </FieldLabel>
                <Input
                  id="github-issue-linked-branch-repository"
                  value={branchRepository}
                  autoComplete="off"
                  spellCheck={false}
                  disabled={createMutation.isPending}
                  placeholder={currentRepository}
                  onChange={(event) => setBranchRepository(event.target.value)}
                />
                <FieldDescription>
                  {t("workspace.repositories.linkedBranchRepositoryDescription")}
                </FieldDescription>
              </Field>
            </FieldGroup>
            {mutationError ? (
              <Alert variant="destructive" className="mt-4">
                <CircleAlert />
                <AlertTitle>{t("workspace.repositories.linkedBranchCreateFailed")}</AlertTitle>
                <AlertDescription>{createMutationErrorMessage(mutationError)}</AlertDescription>
              </Alert>
            ) : null}
          </form>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={createMutation.isPending}
              onClick={() => setCreateOpen(false)}
            >
              {t("workspace.repositories.cancel")}
            </Button>
            <Button
              type="submit"
              form="github-issue-linked-branch-form"
              disabled={createMutation.isPending || branchInvalid}
            >
              {createMutation.isPending ? (
                <Spinner data-icon="inline-start" />
              ) : (
                <GitBranch data-icon="inline-start" />
              )}
              {createMutation.isPending
                ? t("workspace.repositories.creatingLinkedBranch")
                : t("workspace.repositories.createLinkedBranch")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={Boolean(unlinkCandidate)}
        onOpenChange={(open) => {
          if (deleteMutation.isPending) return;
          if (!open) {
            deleteMutation.reset();
            setUnlinkCandidate(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("workspace.repositories.unlinkLinkedBranchTitle", {
                branch: unlinkCandidate?.name ?? "",
              })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("workspace.repositories.unlinkLinkedBranchDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {deleteMutation.error ? (
            <Alert variant="destructive">
              <CircleAlert />
              <AlertTitle>{t("workspace.repositories.linkedBranchUnlinkFailed")}</AlertTitle>
              <AlertDescription>
                {mutationErrorMessage(parseIpcError(deleteMutation.error))}
              </AlertDescription>
            </Alert>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>
              {t("workspace.repositories.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={deleteMutation.isPending || !unlinkCandidate}
              onClick={(event) => {
                event.preventDefault();
                deleteMutation.mutate();
              }}
            >
              {deleteMutation.isPending ? (
                <Spinner data-icon="inline-start" />
              ) : (
                <Unlink data-icon="inline-start" />
              )}
              {deleteMutation.isPending
                ? t("workspace.repositories.unlinkingLinkedBranch")
                : t("workspace.repositories.unlinkLinkedBranch")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
