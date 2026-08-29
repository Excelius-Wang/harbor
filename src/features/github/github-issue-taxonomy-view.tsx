import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  CircleAlert,
  Pencil,
  Plus,
  RefreshCw,
  RotateCcw,
  Tag,
  Trash2,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
import { Badge } from "@/components/ui/badge";
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
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { parseIpcError } from "@/lib/ipc-error";
import type {
  GitHubIssueLabel,
  GitHubIssueLabelMutation,
  GitHubIssueMilestone,
  GitHubIssueMilestoneMutation,
  GitHubRepository,
} from "./github-data";
import { GitHubIssueLabelBadge } from "./github-issue-shared";
import {
  invalidateRepositoryIssueTaxonomy,
  mutateRepositoryIssueLabel,
  mutateRepositoryIssueMilestone,
  syncRepositoryIssueLabel,
  syncRepositoryIssueMilestone,
  type GitHubIssueLabelMutationTarget,
  type GitHubIssueMilestoneMutationTarget,
} from "./github-issue-taxonomy-mutations";
import {
  repositoryIssueLabelsQueryOptions,
  repositoryIssueMilestonesQueryOptions,
} from "./github-queries";

type TaxonomyTab = "labels" | "milestones";
type LabelEditor = { mode: "create" } | { mode: "edit"; label: GitHubIssueLabel };
type MilestoneEditor = { mode: "create" } | { mode: "edit"; milestone: GitHubIssueMilestone };

function TaxonomySkeletons() {
  return (
    <div className="flex flex-col gap-3 p-4 sm:p-5">
      {Array.from({ length: 5 }, (_, index) => (
        <div key={index} className="flex items-center gap-4 rounded-md border px-3 py-4">
          <Skeleton className="h-5 w-28" />
          <Skeleton className="h-3 min-w-0 flex-1" />
          <Skeleton className="size-8" />
          <Skeleton className="size-8" />
        </div>
      ))}
    </div>
  );
}

function TaxonomyLoadError({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const { t } = useTranslation();
  const parsed = parseIpcError(error);
  return (
    <Empty className="min-h-72">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <CircleAlert />
        </EmptyMedia>
        <EmptyTitle>{t("workspace.repositories.taxonomyLoadFailed")}</EmptyTitle>
        <EmptyDescription>{parsed.message}</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button variant="outline" onClick={onRetry}>
          <RefreshCw data-icon="inline-start" />
          {t("workspace.repositories.retry")}
        </Button>
      </EmptyContent>
    </Empty>
  );
}

function LabelEditorDialog({
  editor,
  pending,
  error,
  onClose,
  onSubmit,
  onDraftChange,
}: {
  editor: LabelEditor;
  pending: boolean;
  error: unknown;
  onClose: () => void;
  onSubmit: (mutation: GitHubIssueLabelMutation) => void;
  onDraftChange: () => void;
}) {
  const { t } = useTranslation();
  const current = editor.mode === "edit" ? editor.label : null;
  const [name, setName] = useState(current?.name ?? "");
  const [color, setColor] = useState(current?.color ?? "0969da");
  const [description, setDescription] = useState(current?.description ?? "");
  const normalizedColor = color.trim().replace(/^#/, "");
  const validColor = /^[0-9a-fA-F]{6}$/.test(normalizedColor);
  const valid = Boolean(name.trim()) && name.trim().length <= 50 && validColor;
  const parsed = error ? parseIpcError(error) : null;

  return (
    <Dialog open onOpenChange={(open) => !open && !pending && onClose()}>
      <DialogContent>
        <form
          className="flex flex-col gap-5"
          onSubmit={(event) => {
            event.preventDefault();
            if (!valid) return;
            onSubmit(
              current
                ? {
                    action: "update",
                    originalName: current.name,
                    name,
                    color: normalizedColor,
                    description,
                  }
                : { action: "create", name, color: normalizedColor, description }
            );
          }}
        >
          <DialogHeader>
            <DialogTitle>
              {t(
                current
                  ? "workspace.repositories.editLabelTitle"
                  : "workspace.repositories.createLabelTitle"
              )}
            </DialogTitle>
            <DialogDescription>
              {t("workspace.repositories.labelDialogDescription")}
            </DialogDescription>
          </DialogHeader>
          <FieldGroup className="gap-4">
            <Field>
              <FieldLabel htmlFor="issue-label-name">
                {t("workspace.repositories.labelName")}
              </FieldLabel>
              <Input
                id="issue-label-name"
                value={name}
                maxLength={50}
                disabled={pending}
                aria-invalid={!name.trim() || name.trim().length > 50}
                onChange={(event) => {
                  setName(event.target.value);
                  onDraftChange();
                }}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="issue-label-color">
                {t("workspace.repositories.labelColor")}
              </FieldLabel>
              <div className="flex items-center gap-2">
                <Input
                  type="color"
                  value={validColor ? `#${normalizedColor}` : "#0969da"}
                  aria-label={t("workspace.repositories.pickLabelColor")}
                  className="w-12 shrink-0 p-1"
                  disabled={pending}
                  onChange={(event) => {
                    setColor(event.target.value.slice(1));
                    onDraftChange();
                  }}
                />
                <Input
                  id="issue-label-color"
                  value={color}
                  maxLength={7}
                  placeholder="0969da"
                  disabled={pending}
                  aria-invalid={!validColor}
                  onChange={(event) => {
                    setColor(event.target.value);
                    onDraftChange();
                  }}
                />
                <GitHubIssueLabelBadge
                  name={name.trim() || t("workspace.repositories.labelPreview")}
                  color={validColor ? normalizedColor : "6e7681"}
                />
              </div>
              <FieldDescription>{t("workspace.repositories.labelColorHint")}</FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="issue-label-description">
                {t("workspace.repositories.labelDescription")}
              </FieldLabel>
              <Input
                id="issue-label-description"
                value={description}
                maxLength={100}
                disabled={pending}
                onChange={(event) => {
                  setDescription(event.target.value);
                  onDraftChange();
                }}
              />
              <FieldDescription>
                {t("workspace.repositories.characterCount", {
                  count: description.length,
                  limit: 100,
                })}
              </FieldDescription>
            </Field>
          </FieldGroup>
          {parsed ? (
            <Alert variant="destructive">
              <CircleAlert />
              <AlertTitle>{t("workspace.repositories.labelMutationFailed")}</AlertTitle>
              <AlertDescription>{parsed.message}</AlertDescription>
            </Alert>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" disabled={pending} onClick={onClose}>
              {t("workspace.repositories.cancel")}
            </Button>
            <Button type="submit" disabled={pending || !valid}>
              {pending ? <Spinner data-icon="inline-start" /> : <Tag data-icon="inline-start" />}
              {t(
                current ? "workspace.repositories.saveLabel" : "workspace.repositories.createLabel"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function MilestoneEditorDialog({
  editor,
  pending,
  error,
  onClose,
  onSubmit,
  onDraftChange,
}: {
  editor: MilestoneEditor;
  pending: boolean;
  error: unknown;
  onClose: () => void;
  onSubmit: (mutation: GitHubIssueMilestoneMutation) => void;
  onDraftChange: () => void;
}) {
  const { t } = useTranslation();
  const current = editor.mode === "edit" ? editor.milestone : null;
  const [title, setTitle] = useState(current?.title ?? "");
  const [description, setDescription] = useState(current?.description ?? "");
  const [dueOn, setDueOn] = useState(current?.dueOn?.slice(0, 10) ?? "");
  const valid = Boolean(title.trim());
  const parsed = error ? parseIpcError(error) : null;

  return (
    <Dialog open onOpenChange={(open) => !open && !pending && onClose()}>
      <DialogContent>
        <form
          className="flex flex-col gap-5"
          onSubmit={(event) => {
            event.preventDefault();
            if (!valid) return;
            onSubmit(
              current
                ? {
                    action: "update",
                    number: current.number,
                    title,
                    description,
                    dueOn: dueOn || null,
                    state: current.state,
                  }
                : { action: "create", title, description, dueOn: dueOn || null }
            );
          }}
        >
          <DialogHeader>
            <DialogTitle>
              {t(
                current
                  ? "workspace.repositories.editMilestoneTitle"
                  : "workspace.repositories.createMilestoneTitle"
              )}
            </DialogTitle>
            <DialogDescription>
              {t("workspace.repositories.milestoneDialogDescription")}
            </DialogDescription>
          </DialogHeader>
          <FieldGroup className="gap-4">
            <Field>
              <FieldLabel htmlFor="issue-milestone-title">
                {t("workspace.repositories.milestoneTitle")}
              </FieldLabel>
              <Input
                id="issue-milestone-title"
                value={title}
                maxLength={256}
                disabled={pending}
                aria-invalid={!title.trim()}
                onChange={(event) => {
                  setTitle(event.target.value);
                  onDraftChange();
                }}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="issue-milestone-description">
                {t("workspace.repositories.milestoneDescription")}
              </FieldLabel>
              <Textarea
                id="issue-milestone-description"
                value={description}
                maxLength={10_000}
                className="min-h-24 resize-y"
                disabled={pending}
                onChange={(event) => {
                  setDescription(event.target.value);
                  onDraftChange();
                }}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="issue-milestone-due-on">
                {t("workspace.repositories.milestoneDueOn")}
              </FieldLabel>
              <Input
                id="issue-milestone-due-on"
                type="date"
                value={dueOn}
                disabled={pending}
                onChange={(event) => {
                  setDueOn(event.target.value);
                  onDraftChange();
                }}
              />
              <FieldDescription>{t("workspace.repositories.milestoneDueOnHint")}</FieldDescription>
            </Field>
          </FieldGroup>
          {parsed ? (
            <Alert variant="destructive">
              <CircleAlert />
              <AlertTitle>{t("workspace.repositories.milestoneMutationFailed")}</AlertTitle>
              <AlertDescription>{parsed.message}</AlertDescription>
            </Alert>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" disabled={pending} onClick={onClose}>
              {t("workspace.repositories.cancel")}
            </Button>
            <Button type="submit" disabled={pending || !valid}>
              {pending ? (
                <Spinner data-icon="inline-start" />
              ) : (
                <CalendarDays data-icon="inline-start" />
              )}
              {t(
                current
                  ? "workspace.repositories.saveMilestone"
                  : "workspace.repositories.createMilestone"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DeleteTaxonomyDialog({
  kind,
  name,
  pending,
  error,
  onClose,
  onConfirm,
}: {
  kind: "label" | "milestone";
  name: string;
  pending: boolean;
  error: unknown;
  onClose: () => void;
  onConfirm: (confirmation: string) => void;
}) {
  const { t } = useTranslation();
  const [confirmation, setConfirmation] = useState("");
  const parsed = error ? parseIpcError(error) : null;
  return (
    <AlertDialog open onOpenChange={(open) => !open && !pending && onClose()}>
      <AlertDialogContent size="sm">
        <AlertDialogHeader>
          <AlertDialogTitle>
            {t(`workspace.repositories.delete${kind === "label" ? "Label" : "Milestone"}Title`)}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {t(
              `workspace.repositories.delete${kind === "label" ? "Label" : "Milestone"}Description`,
              { name }
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <Field>
          <FieldLabel htmlFor={`delete-${kind}-confirmation`}>
            {t("workspace.repositories.typeToConfirm", { name })}
          </FieldLabel>
          <Input
            id={`delete-${kind}-confirmation`}
            value={confirmation}
            disabled={pending}
            onChange={(event) => setConfirmation(event.target.value)}
          />
        </Field>
        {parsed ? (
          <Alert variant="destructive">
            <CircleAlert />
            <AlertTitle>{t("workspace.repositories.taxonomyDeleteFailed")}</AlertTitle>
            <AlertDescription>{parsed.message}</AlertDescription>
          </Alert>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>
            {t("workspace.repositories.cancel")}
          </AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={pending || confirmation !== name}
            onClick={(event) => {
              event.preventDefault();
              onConfirm(confirmation);
            }}
          >
            {pending ? <Spinner data-icon="inline-start" /> : <Trash2 data-icon="inline-start" />}
            {t("workspace.repositories.deleteTaxonomy")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function ActionButton({
  label,
  icon: Icon,
  destructive = false,
  disabled,
  onClick,
}: {
  label: string;
  icon: typeof Pencil;
  destructive?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className={
            destructive
              ? "text-destructive hover:bg-destructive/10 hover:text-destructive dark:hover:bg-destructive/15"
              : undefined
          }
          aria-label={label}
          disabled={disabled}
          onClick={onClick}
        >
          <Icon />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

function formatDueDate(value: string | undefined, locale: string) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? null
    : new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(date);
}

export function GitHubIssueTaxonomyView({
  repository,
  onBack,
}: {
  repository: GitHubRepository;
  onBack: () => void;
}) {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const target = useMemo(
    () => ({ owner: repository.owner, repository: repository.name }),
    [repository.name, repository.owner]
  );
  const [tab, setTab] = useState<TaxonomyTab>("labels");
  const [labelEditor, setLabelEditor] = useState<LabelEditor | null>(null);
  const [milestoneEditor, setMilestoneEditor] = useState<MilestoneEditor | null>(null);
  const [labelDelete, setLabelDelete] = useState<GitHubIssueLabel | null>(null);
  const [milestoneDelete, setMilestoneDelete] = useState<GitHubIssueMilestone | null>(null);
  const [rowError, setRowError] = useState<{ number: number; message: string } | null>(null);
  const labelsResult = useQuery(repositoryIssueLabelsQueryOptions(target));
  const milestonesResult = useQuery(repositoryIssueMilestonesQueryOptions(target));

  const labelMutation = useMutation({
    mutationFn: mutateRepositoryIssueLabel,
    onSuccess: (label, mutationTarget) => {
      syncRepositoryIssueLabel(queryClient, mutationTarget, label);
      toast.success(
        t(
          mutationTarget.mutation.action === "create"
            ? "workspace.repositories.labelCreated"
            : mutationTarget.mutation.action === "update"
              ? "workspace.repositories.labelUpdated"
              : "workspace.repositories.labelDeleted"
        )
      );
      setLabelEditor(null);
      setLabelDelete(null);
      void invalidateRepositoryIssueTaxonomy(queryClient, target);
    },
  });
  const milestoneMutation = useMutation({
    mutationFn: mutateRepositoryIssueMilestone,
    onSuccess: (milestone, mutationTarget) => {
      syncRepositoryIssueMilestone(queryClient, mutationTarget, milestone);
      toast.success(
        t(
          mutationTarget.mutation.action === "create"
            ? "workspace.repositories.milestoneCreated"
            : mutationTarget.mutation.action === "update"
              ? "workspace.repositories.milestoneUpdated"
              : "workspace.repositories.milestoneDeleted"
        )
      );
      setMilestoneEditor(null);
      setMilestoneDelete(null);
      setRowError(null);
      void invalidateRepositoryIssueTaxonomy(queryClient, target);
    },
  });

  const submitLabel = (mutation: GitHubIssueLabelMutation) => {
    labelMutation.reset();
    labelMutation.mutate({ ...target, mutation });
  };
  const submitMilestone = (mutation: GitHubIssueMilestoneMutation) => {
    milestoneMutation.reset();
    setRowError(null);
    milestoneMutation.mutate({ ...target, mutation });
  };
  const updateMilestoneState = (milestone: GitHubIssueMilestone) => {
    const mutationTarget: GitHubIssueMilestoneMutationTarget = {
      ...target,
      mutation: {
        action: "update",
        number: milestone.number,
        title: milestone.title,
        description: milestone.description ?? "",
        dueOn: milestone.dueOn?.slice(0, 10) ?? null,
        state: milestone.state === "open" ? "closed" : "open",
      },
    };
    milestoneMutation.reset();
    setRowError(null);
    milestoneMutation.mutate(mutationTarget, {
      onError: (reason) => {
        setRowError({ number: milestone.number, message: parseIpcError(reason).message });
      },
    });
  };

  const labels = labelsResult.data?.labels ?? [];
  const milestones = milestonesResult.data?.milestones ?? [];

  return (
    <div className="@container/issues flex min-h-0 flex-1 flex-col">
      <div className="flex min-h-12 items-center border-b px-4 py-2">
        <Button type="button" variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft data-icon="inline-start" />
          {t("workspace.repositories.backToIssues")}
        </Button>
      </div>
      <div className="flex min-h-0 flex-1 flex-col">
        <header className="border-b px-4 py-4 sm:px-5">
          <h2 className="text-foreground text-xl leading-7 font-semibold tracking-[-0.025em]">
            {t("workspace.repositories.taxonomyTitle")}
          </h2>
          <p className="text-muted-foreground mt-1 max-w-2xl text-xs leading-5">
            {t("workspace.repositories.taxonomyDescription", {
              repository: repository.fullName,
            })}
          </p>
        </header>
        <Tabs
          value={tab}
          onValueChange={(value) => setTab(value as TaxonomyTab)}
          className="min-h-0 flex-1 gap-0"
        >
          <div className="flex min-h-12 items-center justify-between gap-3 border-b px-4 sm:px-5">
            <TabsList variant="line" className="h-12 gap-4 p-0">
              <TabsTrigger value="labels" className="px-1.5 text-xs">
                <Tag />
                {t("workspace.repositories.labels")}
                <Badge variant="secondary">{labels.length}</Badge>
              </TabsTrigger>
              <TabsTrigger value="milestones" className="px-1.5 text-xs">
                <CalendarDays />
                {t("workspace.repositories.milestones")}
                <Badge variant="secondary">{milestones.length}</Badge>
              </TabsTrigger>
            </TabsList>
            <Button
              type="button"
              size="sm"
              onClick={() =>
                tab === "labels"
                  ? setLabelEditor({ mode: "create" })
                  : setMilestoneEditor({ mode: "create" })
              }
            >
              <Plus data-icon="inline-start" />
              {t(
                tab === "labels"
                  ? "workspace.repositories.newLabel"
                  : "workspace.repositories.newMilestone"
              )}
            </Button>
          </div>
          <TabsContent value="labels" className="min-h-0">
            <ScrollArea className="h-full">
              {labelsResult.isPending ? (
                <TaxonomySkeletons />
              ) : labelsResult.error && !labelsResult.data ? (
                <TaxonomyLoadError
                  error={labelsResult.error}
                  onRetry={() => void labelsResult.refetch()}
                />
              ) : labels.length ? (
                <div className="p-4 sm:p-5">
                  {labelsResult.error ? (
                    <Alert variant="destructive" className="mb-3">
                      <CircleAlert />
                      <AlertDescription>
                        {parseIpcError(labelsResult.error).message}
                      </AlertDescription>
                    </Alert>
                  ) : null}
                  <div className="overflow-hidden rounded-lg border">
                    <Table className="min-w-[620px]">
                      <TableHeader>
                        <TableRow>
                          <TableHead>{t("workspace.repositories.labelName")}</TableHead>
                          <TableHead>{t("workspace.repositories.labelDescription")}</TableHead>
                          <TableHead className="w-24">
                            {t("workspace.repositories.labelType")}
                          </TableHead>
                          <TableHead className="w-24 text-right">
                            {t("workspace.repositories.actions")}
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {labels.map((label) => (
                          <TableRow key={label.name}>
                            <TableCell>
                              <GitHubIssueLabelBadge {...label} />
                            </TableCell>
                            <TableCell className="text-muted-foreground min-w-[240px] whitespace-normal">
                              {label.description || t("workspace.repositories.noLabelDescription")}
                            </TableCell>
                            <TableCell>
                              {label.isDefault ? (
                                <Badge variant="outline">
                                  {t("workspace.repositories.defaultLabel")}
                                </Badge>
                              ) : null}
                            </TableCell>
                            <TableCell>
                              <div className="flex justify-end gap-1">
                                <ActionButton
                                  label={t("workspace.repositories.editLabel")}
                                  icon={Pencil}
                                  disabled={labelMutation.isPending}
                                  onClick={() => {
                                    labelMutation.reset();
                                    setLabelEditor({ mode: "edit", label });
                                  }}
                                />
                                <ActionButton
                                  label={t("workspace.repositories.deleteLabel")}
                                  icon={Trash2}
                                  destructive
                                  disabled={labelMutation.isPending}
                                  onClick={() => {
                                    labelMutation.reset();
                                    setLabelDelete(label);
                                  }}
                                />
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              ) : (
                <Empty className="min-h-72">
                  <EmptyHeader>
                    <EmptyMedia variant="icon">
                      <Tag />
                    </EmptyMedia>
                    <EmptyTitle>{t("workspace.repositories.noLabels")}</EmptyTitle>
                    <EmptyDescription>
                      {t("workspace.repositories.noLabelsDescription")}
                    </EmptyDescription>
                  </EmptyHeader>
                  <EmptyContent>
                    <Button onClick={() => setLabelEditor({ mode: "create" })}>
                      <Plus data-icon="inline-start" />
                      {t("workspace.repositories.newLabel")}
                    </Button>
                  </EmptyContent>
                </Empty>
              )}
            </ScrollArea>
          </TabsContent>
          <TabsContent value="milestones" className="min-h-0">
            <ScrollArea className="h-full">
              {milestonesResult.isPending ? (
                <TaxonomySkeletons />
              ) : milestonesResult.error && !milestonesResult.data ? (
                <TaxonomyLoadError
                  error={milestonesResult.error}
                  onRetry={() => void milestonesResult.refetch()}
                />
              ) : milestones.length ? (
                <div className="p-4 sm:p-5">
                  {milestonesResult.error ? (
                    <Alert variant="destructive" className="mb-3">
                      <CircleAlert />
                      <AlertDescription>
                        {parseIpcError(milestonesResult.error).message}
                      </AlertDescription>
                    </Alert>
                  ) : null}
                  <div className="overflow-hidden rounded-lg border">
                    <Table className="min-w-[720px]">
                      <TableHeader>
                        <TableRow>
                          <TableHead>{t("workspace.repositories.milestoneTitle")}</TableHead>
                          <TableHead className="w-48">
                            {t("workspace.repositories.progress")}
                          </TableHead>
                          <TableHead className="w-36">
                            {t("workspace.repositories.milestoneDueOn")}
                          </TableHead>
                          <TableHead className="w-32 text-right">
                            {t("workspace.repositories.actions")}
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {milestones.map((milestone) => {
                          const total = milestone.openIssues + milestone.closedIssues;
                          const completion = total
                            ? Math.round((milestone.closedIssues / total) * 100)
                            : 0;
                          const dueDate = formatDueDate(milestone.dueOn, i18n.language);
                          const pending =
                            milestoneMutation.isPending &&
                            milestoneMutation.variables.mutation.action !== "create" &&
                            milestoneMutation.variables.mutation.number === milestone.number;
                          return (
                            <TableRow key={milestone.number}>
                              <TableCell className="min-w-[240px] whitespace-normal">
                                <div className="flex flex-col gap-1">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className="font-medium">{milestone.title}</span>
                                    <Badge variant="outline">
                                      {t(`workspace.repositories.${milestone.state}`)}
                                    </Badge>
                                  </div>
                                  {milestone.description ? (
                                    <span className="text-muted-foreground line-clamp-2 text-xs">
                                      {milestone.description}
                                    </span>
                                  ) : null}
                                  {rowError?.number === milestone.number ? (
                                    <span role="alert" className="text-destructive text-xs">
                                      {rowError.message}
                                    </span>
                                  ) : null}
                                </div>
                              </TableCell>
                              <TableCell>
                                <div className="flex min-w-36 flex-col gap-1.5">
                                  <span className="text-muted-foreground text-[10px]">
                                    {t("workspace.repositories.milestoneCompletion", {
                                      percent: completion,
                                      closed: milestone.closedIssues,
                                      total,
                                    })}
                                  </span>
                                  <Progress
                                    value={completion}
                                    className="h-1.5"
                                    aria-label={t("workspace.repositories.milestoneProgressLabel", {
                                      title: milestone.title,
                                      percent: completion,
                                    })}
                                  />
                                </div>
                              </TableCell>
                              <TableCell className="text-muted-foreground text-xs">
                                {dueDate ?? t("workspace.repositories.noDueDate")}
                              </TableCell>
                              <TableCell>
                                <div className="flex justify-end gap-1">
                                  <ActionButton
                                    label={t("workspace.repositories.editMilestone")}
                                    icon={Pencil}
                                    disabled={milestoneMutation.isPending}
                                    onClick={() => {
                                      milestoneMutation.reset();
                                      setMilestoneEditor({ mode: "edit", milestone });
                                    }}
                                  />
                                  <ActionButton
                                    label={t(
                                      milestone.state === "open"
                                        ? "workspace.repositories.closeMilestone"
                                        : "workspace.repositories.reopenMilestone"
                                    )}
                                    icon={milestone.state === "open" ? CheckCircle2 : RotateCcw}
                                    disabled={milestoneMutation.isPending}
                                    onClick={() => updateMilestoneState(milestone)}
                                  />
                                  <ActionButton
                                    label={t("workspace.repositories.deleteMilestone")}
                                    icon={Trash2}
                                    destructive
                                    disabled={milestoneMutation.isPending}
                                    onClick={() => {
                                      milestoneMutation.reset();
                                      setMilestoneDelete(milestone);
                                    }}
                                  />
                                  {pending ? <Spinner className="self-center" /> : null}
                                </div>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              ) : (
                <Empty className="min-h-72">
                  <EmptyHeader>
                    <EmptyMedia variant="icon">
                      <CalendarDays />
                    </EmptyMedia>
                    <EmptyTitle>{t("workspace.repositories.noMilestones")}</EmptyTitle>
                    <EmptyDescription>
                      {t("workspace.repositories.noMilestonesDescription")}
                    </EmptyDescription>
                  </EmptyHeader>
                  <EmptyContent>
                    <Button onClick={() => setMilestoneEditor({ mode: "create" })}>
                      <Plus data-icon="inline-start" />
                      {t("workspace.repositories.newMilestone")}
                    </Button>
                  </EmptyContent>
                </Empty>
              )}
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </div>

      {labelEditor ? (
        <LabelEditorDialog
          key={labelEditor.mode === "edit" ? labelEditor.label.name : "new-label"}
          editor={labelEditor}
          pending={labelMutation.isPending}
          error={labelMutation.error}
          onClose={() => setLabelEditor(null)}
          onDraftChange={() => labelMutation.reset()}
          onSubmit={submitLabel}
        />
      ) : null}
      {milestoneEditor ? (
        <MilestoneEditorDialog
          key={milestoneEditor.mode === "edit" ? milestoneEditor.milestone.number : "new-milestone"}
          editor={milestoneEditor}
          pending={milestoneMutation.isPending}
          error={milestoneMutation.error}
          onClose={() => setMilestoneEditor(null)}
          onDraftChange={() => milestoneMutation.reset()}
          onSubmit={submitMilestone}
        />
      ) : null}
      {labelDelete ? (
        <DeleteTaxonomyDialog
          key={labelDelete.name}
          kind="label"
          name={labelDelete.name}
          pending={labelMutation.isPending}
          error={labelMutation.error}
          onClose={() => setLabelDelete(null)}
          onConfirm={(confirmation) => {
            const mutationTarget: GitHubIssueLabelMutationTarget = {
              ...target,
              mutation: { action: "delete", name: labelDelete.name, confirmation },
            };
            labelMutation.mutate(mutationTarget);
          }}
        />
      ) : null}
      {milestoneDelete ? (
        <DeleteTaxonomyDialog
          key={milestoneDelete.number}
          kind="milestone"
          name={milestoneDelete.title}
          pending={milestoneMutation.isPending}
          error={milestoneMutation.error}
          onClose={() => setMilestoneDelete(null)}
          onConfirm={(confirmation) =>
            milestoneMutation.mutate({
              ...target,
              mutation: {
                action: "delete",
                number: milestoneDelete.number,
                confirmation,
              },
            })
          }
        />
      ) : null}
    </div>
  );
}
