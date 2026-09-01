import { CircleAlert, ListChecks } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAppTranslation } from "@/hooks/use-app-translation";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { parseIpcError } from "@/lib/ipc-error";
import { toast } from "sonner";
import type { GitHubIssue, GitHubRepositoryIdentity } from "./github-data";
import {
  invalidateRepositoryIssueType,
  syncRepositoryIssueType,
  updateRepositoryIssueType,
} from "./github-issue-type-mutations";
import { repositoryIssueTypeStatusQueryOptions } from "./github-queries";

export function GitHubIssueTypeAction({
  repository,
  issue,
}: {
  repository: GitHubRepositoryIdentity;
  issue: GitHubIssue;
}) {
  const { t } = useAppTranslation();
  const queryClient = useQueryClient();
  const target = {
    owner: repository.owner,
    repository: repository.name,
    issueNumber: issue.number,
  };
  const result = useQuery(repositoryIssueTypeStatusQueryOptions(target));
  const mutation = useMutation({
    mutationFn: (issueTypeNodeId: string | null) =>
      updateRepositoryIssueType(
        target,
        issue.reactionSubject.id,
        result.data?.currentIssueType?.nodeId ?? null,
        issueTypeNodeId
      ),
    onSuccess: (status) => {
      syncRepositoryIssueType(queryClient, target, status);
      toast.success(t("workspace.repositories.issueTypeUpdated"));
      void invalidateRepositoryIssueType(queryClient, target);
    },
    onError: () => {
      void invalidateRepositoryIssueType(queryClient, target);
    },
  });

  if (result.isPending) {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-muted-foreground flex items-center gap-1.5 text-[10px] font-medium tracking-[0.08em] uppercase">
          <ListChecks /> {t("workspace.repositories.issueType")}
        </p>
        <Skeleton className="h-8 w-full" />
      </div>
    );
  }

  if (result.error || !result.data) {
    const error = result.error ? parseIpcError(result.error) : null;
    return (
      <Alert variant="destructive" className="py-2.5 text-xs">
        <CircleAlert />
        <AlertTitle>{t("workspace.repositories.issueTypeLoadFailed")}</AlertTitle>
        <AlertDescription className="flex flex-col items-start gap-2">
          <span>{error?.message}</span>
          <Button type="button" variant="outline" size="xs" onClick={() => void result.refetch()}>
            {t("workspace.repositories.retry")}
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  const status = result.data;
  const currentValue = status.currentIssueType?.nodeId ?? "none";
  const mutationError = mutation.error ? parseIpcError(mutation.error) : null;
  const canUpdate = status.viewerCanUpdate && !mutation.isPending;

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <p className="text-muted-foreground flex items-center gap-1.5 text-[10px] font-medium tracking-[0.08em] uppercase">
        <ListChecks /> {t("workspace.repositories.issueType")}
      </p>
      <Select
        value={currentValue}
        disabled={!canUpdate}
        onValueChange={(value) => {
          if (value === currentValue) return;
          mutation.reset();
          mutation.mutate(value === "none" ? null : value);
        }}
      >
        <SelectTrigger size="sm" aria-label={t("workspace.repositories.issueType")}>
          <SelectValue placeholder={t("workspace.repositories.noIssueType")} />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectItem value="none">{t("workspace.repositories.noIssueType")}</SelectItem>
            {status.availableIssueTypes.map((issueType) => (
              <SelectItem key={issueType.nodeId} value={issueType.nodeId}>
                {issueType.name}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
      {mutationError ? (
        <Alert variant="destructive" className="py-2.5 text-xs">
          <CircleAlert />
          <AlertTitle>{t("workspace.repositories.issueTypeUpdateFailed")}</AlertTitle>
          <AlertDescription>
            {mutationError.code === "githubPermission"
              ? t("workspace.repositories.issueWritePermissionDenied")
              : mutationError.message}
          </AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}
