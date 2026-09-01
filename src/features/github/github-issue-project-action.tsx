import { useMemo, useState } from "react";
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { CircleAlert, FolderKanban, Plus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { parseIpcError } from "@/lib/ipc-error";
import type { GitHubIssue, GitHubRepositoryIdentity } from "./github-data";
import { invalidateRepositoryIssue } from "./github-issue-mutations";
import { addPersonalProjectItem, invalidatePersonalProjects } from "./github-project-mutations";
import { personalProjectsQueryOptions } from "./github-queries";

const projectsTarget = { state: "open" as const, query: "", sort: "updated" as const };

function projectLoadErrorTitle(code: string) {
  if (code === "githubPermission") return "workspace.projects.permissionTitle";
  if (code === "githubRateLimited") return "workspace.repositories.githubRateLimited";
  return "workspace.repositories.personalProjectsLoadFailed";
}

function projectMutationErrorMessage(code: string) {
  if (code === "githubPermission") return "workspace.projects.permissionDescription";
  if (code === "githubRateLimited") return "workspace.repositories.githubRateLimited";
  return undefined;
}

export function GitHubIssueProjectAction({
  repository,
  issue,
}: {
  repository: GitHubRepositoryIdentity;
  issue: GitHubIssue;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [selectedProjectNumber, setSelectedProjectNumber] = useState("");
  const target = {
    owner: repository.owner,
    repository: repository.name,
    issueNumber: issue.number,
  };
  const projectsResult = useInfiniteQuery({
    ...personalProjectsQueryOptions(projectsTarget),
    enabled: open,
  });
  const projects = useMemo(
    () => projectsResult.data?.pages.flatMap((page) => page.projects) ?? [],
    [projectsResult.data]
  );
  const selectedProject = projects.find(
    (project) => project.number === Number(selectedProjectNumber)
  );
  const addMutation = useMutation({
    mutationFn: (projectNumber: number) =>
      addPersonalProjectItem(projectNumber, { kind: "existingItem", url: issue.url }),
    onSuccess: (_item, projectNumber) => {
      setOpen(false);
      setSelectedProjectNumber("");
      toast.success(t("workspace.repositories.issueAddedToProject"));
      void Promise.all([
        invalidatePersonalProjects(queryClient, projectNumber),
        invalidateRepositoryIssue(queryClient, target),
      ]);
    },
    onError: (_error, projectNumber) => {
      void Promise.all([
        invalidatePersonalProjects(queryClient, projectNumber),
        invalidateRepositoryIssue(queryClient, target),
      ]);
    },
  });
  const projectError = projectsResult.error ? parseIpcError(projectsResult.error) : null;
  const mutationError = addMutation.error ? parseIpcError(addMutation.error) : null;
  const mutationErrorKey = mutationError
    ? projectMutationErrorMessage(mutationError.code)
    : undefined;

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="justify-start"
        onClick={() => setOpen(true)}
      >
        <FolderKanban data-icon="inline-start" />
        {t("workspace.repositories.addToProject")}
      </Button>
      <Dialog
        open={open}
        onOpenChange={(nextOpen) => {
          setOpen(nextOpen);
          if (!nextOpen) {
            setSelectedProjectNumber("");
            addMutation.reset();
          }
        }}
      >
        <DialogContent className="harbor-popover sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>{t("workspace.repositories.addToProject")}</DialogTitle>
            <DialogDescription>
              {t("workspace.repositories.addToProjectDescription", { number: issue.number })}
            </DialogDescription>
          </DialogHeader>
          {projectsResult.isPending ? (
            <Skeleton className="h-9 w-full" />
          ) : projectsResult.error ? (
            <Alert variant="destructive">
              <CircleAlert />
              <AlertTitle>{t(projectLoadErrorTitle(projectError?.code ?? ""))}</AlertTitle>
              <AlertDescription className="flex flex-col items-start gap-2">
                <span>{projectError?.message}</span>
                <Button
                  type="button"
                  variant="outline"
                  size="xs"
                  onClick={() => void projectsResult.refetch()}
                >
                  {t("workspace.repositories.retry")}
                </Button>
              </AlertDescription>
            </Alert>
          ) : projects.length === 0 ? (
            <Alert>
              <FolderKanban />
              <AlertTitle>{t("workspace.repositories.noOpenPersonalProjects")}</AlertTitle>
              <AlertDescription>
                {t("workspace.repositories.noOpenPersonalProjectsDescription")}
              </AlertDescription>
            </Alert>
          ) : (
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium" htmlFor="issue-project-target">
                {t("workspace.repositories.selectProject")}
              </label>
              <Select
                value={selectedProjectNumber}
                onValueChange={(value) => {
                  setSelectedProjectNumber(value);
                  addMutation.reset();
                }}
              >
                <SelectTrigger
                  id="issue-project-target"
                  aria-label={t("workspace.repositories.selectProject")}
                >
                  <SelectValue placeholder={t("workspace.repositories.selectProjectPlaceholder")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {projects.map((project) => (
                      <SelectItem
                        key={project.id}
                        value={String(project.number)}
                        disabled={!project.viewerCanUpdate}
                      >
                        {project.title} (#{project.number})
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
              {projectsResult.hasNextPage ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  onClick={() => void projectsResult.fetchNextPage()}
                  disabled={projectsResult.isFetchingNextPage}
                >
                  {projectsResult.isFetchingNextPage ? <Spinner data-icon="inline-start" /> : null}
                  {t("workspace.repositories.loadMorePersonalProjects")}
                </Button>
              ) : null}
              {mutationError ? (
                <Alert variant="destructive">
                  <CircleAlert />
                  <AlertTitle>{t("workspace.repositories.addToProjectFailed")}</AlertTitle>
                  <AlertDescription>
                    {mutationErrorKey ? t(mutationErrorKey) : mutationError.message}
                  </AlertDescription>
                </Alert>
              ) : null}
            </div>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setOpen(false)}
              disabled={addMutation.isPending}
            >
              {t("common.cancel")}
            </Button>
            <Button
              type="button"
              onClick={() => {
                if (selectedProject?.viewerCanUpdate) {
                  addMutation.mutate(selectedProject.number);
                }
              }}
              disabled={!selectedProject?.viewerCanUpdate || addMutation.isPending}
            >
              <Plus data-icon="inline-start" />
              {t("workspace.repositories.addToProject")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
