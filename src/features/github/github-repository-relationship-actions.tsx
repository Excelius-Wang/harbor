import { useId, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, ChevronDown, CircleAlert, GitFork, RefreshCw, Star } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { WorkspaceStaleNotice } from "@/features/workspace/workspace-stale-notice";
import { Spinner } from "@/components/ui/spinner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { parseIpcError } from "@/lib/ipc-error";
import { cn } from "@/lib/utils";
import type { GitHubRepository, GitHubRepositoryWatchLevel } from "./github-data";
import { repositoryRelationshipQueryOptions } from "./github-queries";
import {
  forkRepository,
  refreshPersonalRepositories,
  refreshStarredRepositories,
  syncPersonalFork,
  syncRepositoryRelationship,
  syncRepositoryStar,
  updateRepositoryStar,
  updateRepositoryWatch,
} from "./github-repository-relationships";

const watchLevels: GitHubRepositoryWatchLevel[] = ["participating", "allActivity", "ignored"];

export function GitHubRepositoryRelationshipActions({
  repository,
}: {
  repository: GitHubRepository;
}) {
  return (
    <RepositoryRelationshipActions
      key={`${repository.id}:${repository.owner}/${repository.name}`}
      repository={repository}
    />
  );
}

function RepositoryRelationshipActions({ repository }: { repository: GitHubRepository }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const forkNameId = useId();
  const defaultBranchId = useId();
  const [forkOpen, setForkOpen] = useState(false);
  const [forkName, setForkName] = useState(repository.name);
  const [defaultBranchOnly, setDefaultBranchOnly] = useState(false);
  const target = { owner: repository.owner, repository: repository.name };
  const relationshipResult = useQuery(repositoryRelationshipQueryOptions(target));
  const relationship = relationshipResult.data;

  const starMutation = useMutation({
    mutationFn: (starred: boolean) => updateRepositoryStar(target, starred),
    onSuccess: (next, starred) => {
      syncRepositoryStar(queryClient, repository, next, !starred);
      void refreshStarredRepositories(queryClient);
      toast.success(
        t(starred ? "workspace.repositories.starred" : "workspace.repositories.unstarred")
      );
    },
    onError: (error) =>
      toast.error(t("workspace.repositories.starFailed"), {
        description: parseIpcError(error).message,
      }),
  });
  const watchMutation = useMutation({
    mutationFn: (watchLevel: GitHubRepositoryWatchLevel) =>
      updateRepositoryWatch(target, watchLevel),
    onSuccess: (next) => {
      syncRepositoryRelationship(queryClient, target, next);
      toast.success(t("workspace.repositories.watchUpdated"));
    },
    onError: (error) =>
      toast.error(t("workspace.repositories.watchFailed"), {
        description: parseIpcError(error).message,
      }),
  });
  const forkMutation = useMutation({
    mutationFn: () =>
      forkRepository(target, {
        name: forkName.trim() || undefined,
        defaultBranchOnly,
      }),
    onSuccess: (result) => {
      syncPersonalFork(queryClient, result.repository);
      void refreshPersonalRepositories(queryClient);
      setForkOpen(false);
      toast.success(
        t(
          result.created
            ? "workspace.repositories.forkCreated"
            : "workspace.repositories.forkAlreadyExists",
          { repository: result.repository.fullName }
        ),
        result.created
          ? { description: t("workspace.repositories.forkProcessingDescription") }
          : undefined
      );
    },
  });

  if (relationshipResult.isError && !relationship) {
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => void relationshipResult.refetch()}
        disabled={relationshipResult.isFetching}
      >
        {relationshipResult.isFetching ? <Spinner /> : <RefreshCw />}
        {t("workspace.repositories.retryActions")}
      </Button>
    );
  }

  const actionsPending = relationshipResult.isPending;
  const mutationPending =
    starMutation.isPending || watchMutation.isPending || forkMutation.isPending;
  const forkError = forkMutation.error ? parseIpcError(forkMutation.error) : null;
  const starLabel = t(
    relationship?.starred ? "workspace.repositories.starredLabel" : "workspace.repositories.star"
  );
  const watchLabel = relationship
    ? t(`workspace.repositories.watchLevels.${relationship.watchLevel}.label`)
    : t("workspace.repositories.watch");
  const starCount = Math.max(
    0,
    repository.stars +
      (relationship && starMutation.isPending && starMutation.variables !== undefined
        ? Number(starMutation.variables) - Number(relationship.starred)
        : 0)
  );

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2">
      {relationshipResult.error ? (
        <WorkspaceStaleNotice
          compact
          message={parseIpcError(relationshipResult.error).message}
          onRetry={() => void relationshipResult.refetch()}
          retryDisabled={relationshipResult.isFetching || mutationPending}
        />
      ) : null}
      <div
        role="group"
        className="harbor-control border-border/70 flex items-center rounded-md border p-0.5"
        aria-label={t("workspace.repositories.relationshipActions")}
      >
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 rounded-sm px-2.5"
              disabled={actionsPending || mutationPending}
              aria-pressed={relationship?.starred ?? false}
              onClick={() => relationship && starMutation.mutate(!relationship.starred)}
            >
              {starMutation.isPending ? (
                <Spinner />
              ) : (
                <Star className={cn(relationship?.starred && "text-attention fill-current")} />
              )}
              <span className="max-[1080px]:sr-only">{starLabel}</span>
              <span className="text-muted-foreground tabular-nums">
                {starCount.toLocaleString()}
              </span>
            </Button>
          </TooltipTrigger>
          <TooltipContent>{starLabel}</TooltipContent>
        </Tooltip>

        <Separator orientation="vertical" className="data-[orientation=vertical]:h-4" />

        <DropdownMenu>
          <Tooltip>
            <TooltipTrigger asChild>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 rounded-sm px-2.5"
                  disabled={actionsPending || mutationPending}
                >
                  {watchMutation.isPending ? <Spinner /> : <Bell />}
                  <span className="max-[1160px]:sr-only">{watchLabel}</span>
                  <ChevronDown className="opacity-60" />
                </Button>
              </DropdownMenuTrigger>
            </TooltipTrigger>
            <TooltipContent>{watchLabel}</TooltipContent>
          </Tooltip>
          <DropdownMenuContent align="end" className="w-72">
            <DropdownMenuLabel>{t("workspace.repositories.watchMenuTitle")}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuRadioGroup
              value={relationship?.watchLevel}
              onValueChange={(value) => {
                if (!mutationPending) watchMutation.mutate(value as GitHubRepositoryWatchLevel);
              }}
            >
              {watchLevels.map((level) => (
                <DropdownMenuRadioItem
                  key={level}
                  value={level}
                  disabled={mutationPending}
                  className="items-start py-2"
                >
                  <span className="flex flex-col gap-0.5">
                    <span className="text-[13px] font-medium">
                      {t(`workspace.repositories.watchLevels.${level}.label`)}
                    </span>
                    <span className="text-muted-foreground text-[11px] leading-4 font-normal whitespace-normal">
                      {t(`workspace.repositories.watchLevels.${level}.description`)}
                    </span>
                  </span>
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>

        <Separator orientation="vertical" className="data-[orientation=vertical]:h-4" />

        <Tooltip>
          <TooltipTrigger asChild>
            <span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 rounded-sm px-2.5"
                disabled={
                  actionsPending || relationship?.viewerOwnsRepository || forkMutation.isPending
                }
                onClick={() => {
                  forkMutation.reset();
                  setForkOpen(true);
                }}
              >
                <GitFork />
                <span className="max-[1080px]:sr-only">
                  {t("workspace.repositories.forkAction")}
                </span>
                <span className="text-muted-foreground tabular-nums">
                  {repository.forks.toLocaleString()}
                </span>
              </Button>
            </span>
          </TooltipTrigger>
          <TooltipContent>
            {t(
              relationship?.viewerOwnsRepository
                ? "workspace.repositories.ownRepositoryCannotFork"
                : "workspace.repositories.forkAction"
            )}
          </TooltipContent>
        </Tooltip>
      </div>
      <Dialog
        open={forkOpen}
        onOpenChange={(next) => {
          if (!forkMutation.isPending) setForkOpen(next);
        }}
      >
        <DialogContent showCloseButton={!forkMutation.isPending}>
          <DialogHeader className="pr-8">
            <DialogTitle>{t("workspace.repositories.forkDialogTitle")}</DialogTitle>
            <DialogDescription>
              {t("workspace.repositories.forkDialogDescription", {
                repository: repository.fullName,
                owner: relationship?.viewerLogin,
              })}
            </DialogDescription>
          </DialogHeader>
          <FieldGroup className="gap-5 py-1">
            <Field>
              <FieldLabel htmlFor={forkNameId}>{t("workspace.repositories.forkName")}</FieldLabel>
              <Input
                id={forkNameId}
                disabled={forkMutation.isPending}
                value={forkName}
                maxLength={100}
                autoComplete="off"
                onChange={(event) => setForkName(event.currentTarget.value)}
              />
              <FieldDescription>
                {t("workspace.repositories.forkDestination", {
                  owner: relationship?.viewerLogin,
                  repository: forkName.trim() || repository.name,
                })}
              </FieldDescription>
            </Field>
            <Field orientation="horizontal">
              <Checkbox
                id={defaultBranchId}
                disabled={forkMutation.isPending}
                checked={defaultBranchOnly}
                onCheckedChange={(checked) => setDefaultBranchOnly(checked === true)}
              />
              <FieldContent>
                <FieldLabel htmlFor={defaultBranchId}>
                  {t("workspace.repositories.defaultBranchOnly")}
                </FieldLabel>
                <FieldDescription>
                  {t("workspace.repositories.defaultBranchOnlyDescription", {
                    branch: repository.defaultBranch,
                  })}
                </FieldDescription>
              </FieldContent>
            </Field>
          </FieldGroup>
          {forkError ? (
            <Alert variant="destructive">
              <CircleAlert />
              <AlertTitle>{t("workspace.repositories.forkFailed")}</AlertTitle>
              <AlertDescription>{forkError.message}</AlertDescription>
            </Alert>
          ) : null}
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={forkMutation.isPending}>
                {t("common.cancel")}
              </Button>
            </DialogClose>
            <Button
              type="button"
              disabled={!forkName.trim() || forkMutation.isPending}
              onClick={() => {
                if (forkName.trim() && !forkMutation.isPending) forkMutation.mutate();
              }}
            >
              {forkMutation.isPending ? <Spinner /> : <GitFork />}
              {t(
                forkMutation.isPending
                  ? "workspace.repositories.forkCreating"
                  : "workspace.repositories.createFork"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
