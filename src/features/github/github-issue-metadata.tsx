import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, CircleAlert, CircleSlash2, Flag, Pencil, Tag, UserRound } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { parseIpcError } from "@/lib/ipc-error";
import type {
  GitHubIssue,
  GitHubIssueLabel,
  GitHubItemMetadataValue,
  GitHubRepositoryIdentity,
} from "./github-data";
import { GitHubConversationControls } from "./github-conversation-controls";
import {
  invalidateRepositoryIssue,
  syncUpdatedIssue,
  updateRepositoryIssueMetadata,
  type GitHubIssueMutationTarget,
} from "./github-issue-mutations";
import { GitHubIssueLabelBadge } from "./github-issue-shared";
import { GitHubIssueTypeAction } from "./github-issue-type-action";
import {
  repositoryIssueAssigneesQueryOptions,
  repositoryIssueLabelsQueryOptions,
  repositoryIssueMilestonesQueryOptions,
} from "./github-queries";

type MetadataTab = "assignees" | "labels" | "milestone";

export type GitHubItemMetadataSubject = {
  number: number;
  assignees: string[];
  labels: GitHubIssueLabel[];
  milestone?: string;
  milestoneNumber?: number;
  updatedAt?: string;
};

function sameNames(left: string[], right: string[]) {
  return [...left].sort().join("\0") === [...right].sort().join("\0");
}

function toggleName(values: string[], value: string) {
  return values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
}

function MetadataPanelLoading() {
  return (
    <div className="flex flex-col gap-2 rounded-md border p-3">
      <Skeleton className="h-8 w-full" />
      <Skeleton className="h-8 w-4/5" />
      <Skeleton className="h-8 w-2/3" />
    </div>
  );
}

function MetadataPanelError({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const { t } = useTranslation();
  const parsed = parseIpcError(error);
  return (
    <Alert variant="destructive">
      <CircleAlert />
      <AlertTitle>{t("workspace.repositories.metadataLoadFailed")}</AlertTitle>
      <AlertDescription className="flex flex-col items-start gap-2">
        <span>{parsed.message}</span>
        <Button type="button" variant="outline" size="xs" onClick={onRetry}>
          {t("workspace.repositories.retry")}
        </Button>
      </AlertDescription>
    </Alert>
  );
}

function AssigneePanel({
  repository,
  selected,
  pending,
  onChange,
}: {
  repository: GitHubRepositoryIdentity;
  selected: string[];
  pending: boolean;
  onChange: (value: string[]) => void;
}) {
  const { t } = useTranslation();
  const result = useQuery(
    repositoryIssueAssigneesQueryOptions({
      owner: repository.owner,
      repository: repository.name,
    })
  );
  if (result.isPending) return <MetadataPanelLoading />;
  if (result.error) {
    return <MetadataPanelError error={result.error} onRetry={() => void result.refetch()} />;
  }

  return (
    <div className="flex min-h-0 flex-col gap-2">
      <Command className="min-h-0 rounded-md border">
        <CommandInput placeholder={t("workspace.repositories.searchAssignees")} />
        <CommandList className="max-h-[320px]">
          <CommandEmpty>{t("workspace.repositories.noMatchingAssignees")}</CommandEmpty>
          <CommandGroup>
            {result.data.assignees.map((assignee) => {
              const isSelected = selected.includes(assignee.login);
              return (
                <CommandItem
                  key={assignee.login}
                  value={assignee.login}
                  disabled={pending || (!isSelected && selected.length >= 10)}
                  onSelect={() => onChange(toggleName(selected, assignee.login))}
                >
                  <Avatar className="size-6">
                    <AvatarImage src={assignee.avatarUrl} alt="" />
                    <AvatarFallback>{assignee.login.slice(0, 1).toUpperCase()}</AvatarFallback>
                  </Avatar>
                  <span className="min-w-0 flex-1 truncate">@{assignee.login}</span>
                  {isSelected ? (
                    <span className="sr-only">{t("workspace.repositories.selected")}</span>
                  ) : null}
                  <Check className={cn("ml-auto", isSelected ? "opacity-100" : "opacity-0")} />
                </CommandItem>
              );
            })}
          </CommandGroup>
        </CommandList>
      </Command>
      <p className="text-muted-foreground text-[10px]">
        {t("workspace.repositories.assigneeLimit")}
      </p>
    </div>
  );
}

function LabelPanel({
  repository,
  selected,
  pending,
  onChange,
}: {
  repository: GitHubRepositoryIdentity;
  selected: string[];
  pending: boolean;
  onChange: (value: string[]) => void;
}) {
  const { t } = useTranslation();
  const result = useQuery(
    repositoryIssueLabelsQueryOptions({
      owner: repository.owner,
      repository: repository.name,
    })
  );
  if (result.isPending) return <MetadataPanelLoading />;
  if (result.error) {
    return <MetadataPanelError error={result.error} onRetry={() => void result.refetch()} />;
  }

  return (
    <Command className="min-h-0 rounded-md border">
      <CommandInput placeholder={t("workspace.repositories.searchLabels")} />
      <CommandList className="max-h-[320px]">
        <CommandEmpty>{t("workspace.repositories.noMatchingLabels")}</CommandEmpty>
        <CommandGroup>
          {result.data.labels.map((label) => {
            const isSelected = selected.includes(label.name);
            return (
              <CommandItem
                key={label.name}
                value={label.name}
                disabled={pending}
                onSelect={() => onChange(toggleName(selected, label.name))}
              >
                <GitHubIssueLabelBadge {...label} />
                {isSelected ? (
                  <span className="sr-only">{t("workspace.repositories.selected")}</span>
                ) : null}
                <Check className={cn("ml-auto", isSelected ? "opacity-100" : "opacity-0")} />
              </CommandItem>
            );
          })}
        </CommandGroup>
      </CommandList>
    </Command>
  );
}

function MilestonePanel({
  repository,
  selected,
  pending,
  onChange,
}: {
  repository: GitHubRepositoryIdentity;
  selected: number | null;
  pending: boolean;
  onChange: (value: number | null) => void;
}) {
  const { t } = useTranslation();
  const result = useQuery(
    repositoryIssueMilestonesQueryOptions({
      owner: repository.owner,
      repository: repository.name,
    })
  );
  if (result.isPending) return <MetadataPanelLoading />;
  if (result.error) {
    return <MetadataPanelError error={result.error} onRetry={() => void result.refetch()} />;
  }

  return (
    <Command className="min-h-0 rounded-md border">
      <CommandInput placeholder={t("workspace.repositories.searchMilestones")} />
      <CommandList className="max-h-[320px]">
        <CommandEmpty>{t("workspace.repositories.noMatchingMilestones")}</CommandEmpty>
        <CommandGroup>
          <CommandItem
            value={t("workspace.repositories.noMilestone")}
            disabled={pending}
            onSelect={() => onChange(null)}
          >
            <CircleSlash2 />
            <span className="min-w-0 flex-1">{t("workspace.repositories.noMilestone")}</span>
            {selected === null ? (
              <span className="sr-only">{t("workspace.repositories.selected")}</span>
            ) : null}
            <Check className={cn("ml-auto", selected === null ? "opacity-100" : "opacity-0")} />
          </CommandItem>
          {result.data.milestones.map((milestone) => (
            <CommandItem
              key={milestone.number}
              value={`${milestone.title} ${milestone.description ?? ""}`}
              disabled={pending}
              onSelect={() => onChange(milestone.number)}
            >
              <Flag />
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="truncate">{milestone.title}</span>
                <span className="text-muted-foreground truncate text-[10px]">
                  {t("workspace.repositories.milestoneProgress", {
                    open: milestone.openIssues,
                    closed: milestone.closedIssues,
                  })}
                </span>
              </span>
              {selected === milestone.number ? (
                <span className="sr-only">{t("workspace.repositories.selected")}</span>
              ) : null}
              <Check
                className={cn(
                  "ml-auto",
                  selected === milestone.number ? "opacity-100" : "opacity-0"
                )}
              />
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </Command>
  );
}

function GitHubItemMetadataDialog<T extends GitHubItemMetadataSubject>({
  repository,
  subject,
  initialTab,
  title,
  description,
  errorTitle,
  successMessage,
  permissionMessage,
  updateMetadata,
  onUpdated,
  onOpenChange,
}: {
  repository: GitHubRepositoryIdentity;
  subject: T;
  initialTab: MetadataTab;
  title: string;
  description: string;
  errorTitle: string;
  successMessage: string;
  permissionMessage: string;
  updateMetadata: (value: GitHubItemMetadataValue) => Promise<T>;
  onUpdated: (updated: T) => void;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<MetadataTab>(initialTab);
  const [labels, setLabels] = useState(subject.labels.map((label) => label.name));
  const [assignees, setAssignees] = useState(subject.assignees);
  const [milestoneNumber, setMilestoneNumber] = useState<number | null>(
    subject.milestoneNumber ?? null
  );
  const initialValue: GitHubItemMetadataValue = {
    labels: subject.labels.map((label) => label.name),
    assignees: subject.assignees,
    milestoneNumber: subject.milestoneNumber ?? null,
  };
  const hasChanges =
    !sameNames(labels, initialValue.labels) ||
    !sameNames(assignees, initialValue.assignees) ||
    milestoneNumber !== initialValue.milestoneNumber;
  const mutation = useMutation({
    mutationFn: updateMetadata,
    onSuccess: (updated) => {
      onUpdated(updated);
      toast.success(successMessage);
      onOpenChange(false);
    },
  });
  const mutationError = mutation.error ? parseIpcError(mutation.error) : null;
  const handleChange = (change: () => void) => {
    change();
    if (mutation.isError) mutation.reset();
  };
  const setOpen = (open: boolean) => {
    if (!mutation.isPending) onOpenChange(open);
  };

  return (
    <Dialog open onOpenChange={setOpen}>
      <DialogContent className="max-h-[calc(100vh-2rem)] gap-0 overflow-hidden p-0 sm:max-w-[680px]">
        <DialogHeader className="p-5 pb-3">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <Tabs
          value={activeTab}
          onValueChange={(value) => setActiveTab(value as MetadataTab)}
          className="min-h-0 gap-0"
        >
          <TabsList variant="line" className="mx-5 h-9 justify-start rounded-none p-0">
            <TabsTrigger value="assignees" disabled={mutation.isPending}>
              <UserRound />
              {t("workspace.repositories.assignees")}
            </TabsTrigger>
            <TabsTrigger value="labels" disabled={mutation.isPending}>
              <Tag />
              {t("workspace.repositories.labels")}
            </TabsTrigger>
            <TabsTrigger value="milestone" disabled={mutation.isPending}>
              <Flag />
              {t("workspace.repositories.milestone")}
            </TabsTrigger>
          </TabsList>
          <TabsContent value="assignees" className="min-h-0 p-5 pt-3">
            <AssigneePanel
              repository={repository}
              selected={assignees}
              pending={mutation.isPending}
              onChange={(value) => handleChange(() => setAssignees(value))}
            />
          </TabsContent>
          <TabsContent value="labels" className="min-h-0 p-5 pt-3">
            <LabelPanel
              repository={repository}
              selected={labels}
              pending={mutation.isPending}
              onChange={(value) => handleChange(() => setLabels(value))}
            />
          </TabsContent>
          <TabsContent value="milestone" className="min-h-0 p-5 pt-3">
            <MilestonePanel
              repository={repository}
              selected={milestoneNumber}
              pending={mutation.isPending}
              onChange={(value) => handleChange(() => setMilestoneNumber(value))}
            />
          </TabsContent>
        </Tabs>
        {mutationError ? (
          <Alert variant="destructive" className="mx-5 mb-4 w-auto">
            <CircleAlert />
            <AlertTitle>{errorTitle}</AlertTitle>
            <AlertDescription>
              {mutationError.code === "githubPermission"
                ? permissionMessage
                : mutationError.message}
            </AlertDescription>
          </Alert>
        ) : null}
        <Separator />
        <DialogFooter className="p-4">
          <Button
            type="button"
            variant="outline"
            disabled={mutation.isPending}
            onClick={() => setOpen(false)}
          >
            {t("workspace.repositories.cancel")}
          </Button>
          <Button
            type="button"
            disabled={!hasChanges || mutation.isPending}
            onClick={() =>
              mutation.mutate({
                labels,
                assignees,
                milestoneNumber,
              })
            }
          >
            {mutation.isPending ? <Spinner data-icon="inline-start" /> : null}
            {t(
              mutation.isPending
                ? "workspace.repositories.savingChanges"
                : "workspace.repositories.saveChanges"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function MetadataHeading({
  icon: Icon,
  title,
  editLabel,
  onEdit,
}: {
  icon: typeof UserRound;
  title: string;
  editLabel: string;
  onEdit: () => void;
}) {
  return (
    <div className="mb-2 flex items-center justify-between gap-2">
      <p className="text-muted-foreground flex min-w-0 items-center gap-1.5 text-[10px] font-medium tracking-[0.08em] uppercase">
        <Icon />
        {title}
      </p>
      <Button type="button" variant="ghost" size="icon-xs" aria-label={editLabel} onClick={onEdit}>
        <Pencil />
      </Button>
    </div>
  );
}

export function GitHubItemMetadataSections<T extends GitHubItemMetadataSubject>({
  repository,
  subject,
  dialogTitle,
  dialogDescription,
  errorTitle,
  successMessage,
  permissionMessage,
  updateMetadata,
  onUpdated,
}: {
  repository: GitHubRepositoryIdentity;
  subject: T;
  dialogTitle: string;
  dialogDescription: string;
  errorTitle: string;
  successMessage: string;
  permissionMessage: string;
  updateMetadata: (value: GitHubItemMetadataValue) => Promise<T>;
  onUpdated: (updated: T) => void;
}) {
  const { t } = useTranslation();
  const [editorTab, setEditorTab] = useState<MetadataTab | null>(null);

  return (
    <>
      <div>
        <MetadataHeading
          icon={UserRound}
          title={t("workspace.repositories.assignees")}
          editLabel={t("workspace.repositories.editAssignees")}
          onEdit={() => setEditorTab("assignees")}
        />
        <p className="text-foreground/85 text-xs leading-5">
          {subject.assignees.length
            ? subject.assignees.map((assignee) => `@${assignee}`).join(", ")
            : t("workspace.repositories.unassigned")}
        </p>
      </div>
      <Separator />
      <div>
        <MetadataHeading
          icon={Tag}
          title={t("workspace.repositories.labels")}
          editLabel={t("workspace.repositories.editLabels")}
          onEdit={() => setEditorTab("labels")}
        />
        <div className="flex flex-wrap gap-1.5">
          {subject.labels.length ? (
            subject.labels.map((label) => <GitHubIssueLabelBadge key={label.name} {...label} />)
          ) : (
            <span className="text-muted-foreground text-xs">
              {t("workspace.repositories.none")}
            </span>
          )}
        </div>
      </div>
      <Separator />
      <div>
        <MetadataHeading
          icon={Flag}
          title={t("workspace.repositories.milestone")}
          editLabel={t("workspace.repositories.editMilestone")}
          onEdit={() => setEditorTab("milestone")}
        />
        <p className="text-foreground/85 text-xs">
          {subject.milestone ?? t("workspace.repositories.none")}
        </p>
      </div>
      {editorTab ? (
        <GitHubItemMetadataDialog
          key={`${subject.updatedAt}:${editorTab}`}
          repository={repository}
          subject={subject}
          initialTab={editorTab}
          title={dialogTitle}
          description={dialogDescription}
          errorTitle={errorTitle}
          successMessage={successMessage}
          permissionMessage={permissionMessage}
          updateMetadata={updateMetadata}
          onUpdated={onUpdated}
          onOpenChange={(open) => {
            if (!open) setEditorTab(null);
          }}
        />
      ) : null}
    </>
  );
}

export function GitHubIssueMetadata({
  repository,
  issue,
}: {
  repository: GitHubRepositoryIdentity;
  issue: GitHubIssue;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const target: GitHubIssueMutationTarget = {
    owner: repository.owner,
    repository: repository.name,
    issueNumber: issue.number,
  };

  return (
    <aside className="flex flex-col gap-4 @min-[760px]/issues:sticky @min-[760px]/issues:top-0 @min-[760px]/issues:self-start">
      <GitHubItemMetadataSections
        repository={repository}
        subject={issue}
        dialogTitle={t("workspace.repositories.editIssueMetadata")}
        dialogDescription={t("workspace.repositories.editIssueMetadataDescription", {
          number: issue.number,
        })}
        errorTitle={t("workspace.repositories.updateMetadataFailed")}
        successMessage={t("workspace.repositories.metadataUpdated")}
        permissionMessage={t("workspace.repositories.issueWritePermissionDenied")}
        updateMetadata={(value) => updateRepositoryIssueMetadata(target, value)}
        onUpdated={(updatedIssue) => {
          syncUpdatedIssue(queryClient, target, updatedIssue);
          void invalidateRepositoryIssue(queryClient, target);
        }}
      />
      <Separator />
      <GitHubIssueTypeAction repository={repository} issue={issue} />
      <Separator />
      <GitHubConversationControls
        repository={repository}
        conversationKind="issue"
        conversationNumber={issue.number}
      />
    </aside>
  );
}
