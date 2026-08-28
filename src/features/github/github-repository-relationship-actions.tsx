import { useEffect, useId, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, ChevronDown, GitFork, RefreshCw, Star } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
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
import { Field, FieldContent, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
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

  useEffect(() => {
    setForkOpen(false);
    setForkName(repository.name);
    setDefaultBranchOnly(false);
  }, [repository.id, repository.name]);

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
    onError: (error) =>
      toast.error(t("workspace.repositories.forkFailed"), {
        description: parseIpcError(error).message,
      }),
  });

  if (relationshipResult.isError) {
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
  const mutationPending = starMutation.isPending || watchMutation.isPending;
  const starCount = Math.max(
    0,
    repository.stars +
      (relationship && starMutation.variables !== undefined
        ? Number(starMutation.variables) - Number(relationship.starred)
        : 0)
  );

  return (
    <div
      className="border-border/70 bg-muted/25 flex items-center rounded-md border p-0.5 shadow-xs"
      aria-label={t("workspace.repositories.relationshipActions")}
    >
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
          <Star className={cn(relationship?.starred && "fill-current text-amber-400")} />
        )}
        <span className="max-[1080px]:sr-only">
          {t(
            relationship?.starred
              ? "workspace.repositories.starredLabel"
              : "workspace.repositories.star"
          )}
        </span>
        <span className="text-muted-foreground tabular-nums">{starCount.toLocaleString()}</span>
      </Button>

      <span className="bg-border/70 h-4 w-px" aria-hidden="true" />

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 rounded-sm px-2.5"
            disabled={actionsPending || mutationPending}
          >
            {watchMutation.isPending ? <Spinner /> : <Bell />}
            <span className="max-[1160px]:sr-only">
              {relationship
                ? t(`workspace.repositories.watchLevels.${relationship.watchLevel}.label`)
                : t("workspace.repositories.watch")}
            </span>
            <ChevronDown className="opacity-60" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-72">
          <DropdownMenuLabel>{t("workspace.repositories.watchMenuTitle")}</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuRadioGroup
            value={relationship?.watchLevel}
            onValueChange={(value) => watchMutation.mutate(value as GitHubRepositoryWatchLevel)}
          >
            {watchLevels.map((level) => (
              <DropdownMenuRadioItem key={level} value={level} className="items-start py-2">
                <span className="flex flex-col gap-0.5">
                  <span className="text-xs font-medium">
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

      <span className="bg-border/70 h-4 w-px" aria-hidden="true" />

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
              onClick={() => setForkOpen(true)}
            >
              <GitFork />
              <span className="max-[1080px]:sr-only">{t("workspace.repositories.forkAction")}</span>
              <span className="text-muted-foreground tabular-nums">
                {repository.forks.toLocaleString()}
              </span>
            </Button>
          </span>
        </TooltipTrigger>
        {relationship?.viewerOwnsRepository ? (
          <TooltipContent>{t("workspace.repositories.ownRepositoryCannotFork")}</TooltipContent>
        ) : null}
      </Tooltip>

      <Dialog open={forkOpen} onOpenChange={setForkOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("workspace.repositories.forkDialogTitle")}</DialogTitle>
            <DialogDescription>
              {t("workspace.repositories.forkDialogDescription", {
                repository: repository.fullName,
                owner: relationship?.viewerLogin,
              })}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-5 py-1">
            <Field>
              <FieldLabel htmlFor={forkNameId}>{t("workspace.repositories.forkName")}</FieldLabel>
              <Input
                id={forkNameId}
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
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={forkMutation.isPending}>
                {t("common.cancel")}
              </Button>
            </DialogClose>
            <Button
              type="button"
              disabled={!forkName.trim() || forkMutation.isPending}
              onClick={() => forkMutation.mutate()}
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
