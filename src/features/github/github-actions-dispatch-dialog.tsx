import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CircleAlert, GitBranch, Play, RefreshCw, Tag } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { parseIpcError } from "@/lib/ipc-error";
import {
  createWorkflowDispatchDraft,
  dispatchWorkflow,
  invalidateWorkflowDispatch,
  prepareWorkflowDispatchInputs,
  type GitHubWorkflowDispatchDraft,
  type GitHubWorkflowDispatchFieldError,
} from "./github-actions-mutations";
import type {
  GitHubRepository,
  GitHubWorkflowDispatchInput,
  GitHubWorkflowReference,
} from "./github-data";
import {
  githubQueryKeys,
  workflowDispatchConfigQueryOptions,
  workflowDispatchOptionsQueryOptions,
} from "./github-queries";

function DispatchField({
  definition,
  index,
  value,
  error,
  disabled,
  onChange,
}: {
  definition: GitHubWorkflowDispatchInput;
  index: number;
  value: string | boolean | undefined;
  error?: GitHubWorkflowDispatchFieldError;
  disabled: boolean;
  onChange: (value: string | boolean) => void;
}) {
  const { t } = useTranslation();
  const id = `workflow-dispatch-input-${index}`;
  const label = (
    <>
      <span>{definition.name}</span>
      {definition.required ? <span aria-hidden="true">*</span> : null}
    </>
  );
  const description = definition.description ? (
    <FieldDescription>{definition.description}</FieldDescription>
  ) : null;
  const fieldError = error ? (
    <FieldError>{t(`workspace.repositories.workflowDispatchFieldErrors.${error}`)}</FieldError>
  ) : null;

  if (definition.inputType === "boolean") {
    return (
      <Field orientation="horizontal" data-invalid={Boolean(error)} data-disabled={disabled}>
        <Checkbox
          id={id}
          checked={value === true}
          onCheckedChange={(checked) => onChange(checked === true)}
          aria-invalid={Boolean(error)}
          disabled={disabled}
        />
        <FieldContent>
          <FieldLabel htmlFor={id}>{label}</FieldLabel>
          {description}
          {fieldError}
        </FieldContent>
      </Field>
    );
  }

  if (definition.inputType === "choice" || definition.inputType === "environment") {
    const empty = definition.options.length === 0;
    const selectedValue =
      typeof value === "string" && value
        ? value
        : definition.inputType === "choice"
          ? typeof definition.defaultValue === "string"
            ? definition.defaultValue
            : (definition.options[0] ?? "")
          : "";
    return (
      <Field data-invalid={Boolean(error)} data-disabled={empty || disabled}>
        <FieldLabel htmlFor={id}>{label}</FieldLabel>
        <Select
          key={`${definition.name}:${selectedValue}`}
          value={selectedValue}
          onValueChange={onChange}
          disabled={empty || disabled}
        >
          <SelectTrigger id={id} className="w-full" aria-invalid={Boolean(error)}>
            <SelectValue
              placeholder={t(
                empty
                  ? "workspace.repositories.workflowDispatchNoOptions"
                  : definition.inputType === "environment"
                    ? "workspace.repositories.workflowDispatchEnvironmentPlaceholder"
                    : "workspace.repositories.workflowDispatchChoicePlaceholder"
              )}
            />
          </SelectTrigger>
          <SelectContent position="popper">
            <SelectGroup>
              {definition.options.map((option) => (
                <SelectItem key={option} value={option}>
                  {option}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
        {description}
        {fieldError}
      </Field>
    );
  }

  return (
    <Field data-invalid={Boolean(error)} data-disabled={disabled}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Input
        id={id}
        type={definition.inputType === "number" ? "number" : "text"}
        step={definition.inputType === "number" ? "any" : undefined}
        value={typeof value === "string" ? value : ""}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={Boolean(error)}
        disabled={disabled}
      />
      {description}
      {fieldError}
    </Field>
  );
}

function DispatchLoading() {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-9 w-full" />
      </div>
      <div className="flex flex-col gap-2">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-9 w-full" />
      </div>
    </div>
  );
}

function orderedReferences(references: GitHubWorkflowReference[], defaultBranch: string) {
  return [...references].sort((left, right) => {
    if (left.name === defaultBranch) return -1;
    if (right.name === defaultBranch) return 1;
    if (left.kind !== right.kind) return left.kind === "branch" ? -1 : 1;
    return left.name.localeCompare(right.name);
  });
}

export function GitHubWorkflowDispatchDialog({
  repository,
  initialWorkflowId,
  disabled = false,
  onAccepted,
}: {
  repository: GitHubRepository;
  initialWorkflowId?: number | null;
  disabled?: boolean;
  onAccepted: () => void;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [workflowId, setWorkflowId] = useState<number | null>(null);
  const [reference, setReference] = useState("");
  const [draft, setDraft] = useState<GitHubWorkflowDispatchDraft>({});
  const [fieldErrors, setFieldErrors] = useState<Record<string, GitHubWorkflowDispatchFieldError>>(
    {}
  );
  const repositoryTarget = {
    owner: repository.owner,
    repository: repository.name,
  };
  const optionsResult = useQuery({
    ...workflowDispatchOptionsQueryOptions(repositoryTarget),
    enabled: open,
  });
  const references = useMemo(
    () => orderedReferences(optionsResult.data?.references ?? [], repository.defaultBranch),
    [optionsResult.data?.references, repository.defaultBranch]
  );
  const workflows = optionsResult.data?.workflows ?? [];
  const selectedWorkflowId = workflows.some((workflow) => workflow.id === workflowId)
    ? workflowId
    : (workflows[0]?.id ?? null);
  const selectedReference = references.some((candidate) => candidate.name === reference)
    ? reference
    : (references[0]?.name ?? "");
  const configTarget = {
    ...repositoryTarget,
    workflowId: selectedWorkflowId ?? 0,
    reference: selectedReference,
  };
  const configResult = useQuery({
    ...workflowDispatchConfigQueryOptions(configTarget),
    enabled: open && selectedWorkflowId !== null && Boolean(selectedReference),
  });
  const mutation = useMutation({
    mutationFn: dispatchWorkflow,
    onSuccess: async () => {
      toast.success(t("workspace.repositories.workflowDispatchRequested"));
      if (configResult.data) {
        setDraft(createWorkflowDispatchDraft(configResult.data));
      }
      setFieldErrors({});
      setOpen(false);
      onAccepted();
      await invalidateWorkflowDispatch(queryClient, repositoryTarget);
    },
    onError: (reason, target) => {
      const error = parseIpcError(reason);
      if (error.code === "validation") {
        void queryClient.invalidateQueries({
          queryKey: githubQueryKeys.workflowDispatchConfig(target),
        });
      }
    },
  });

  useEffect(() => {
    setOpen(false);
    setWorkflowId(null);
    setReference("");
    setDraft({});
    setFieldErrors({});
  }, [repository.id]);

  useEffect(() => {
    if (!configResult.data) return;
    setDraft(createWorkflowDispatchDraft(configResult.data));
    setFieldErrors({});
    mutation.reset();
  }, [configResult.data]);

  const optionsError = optionsResult.error ? parseIpcError(optionsResult.error) : null;
  const configError = configResult.error ? parseIpcError(configResult.error) : null;
  const dispatchError = mutation.error ? parseIpcError(mutation.error) : null;
  const config = configResult.data;
  const branches = references.filter((candidate) => candidate.kind === "branch");
  const tags = references.filter((candidate) => candidate.kind === "tag");
  const unavailableRequiredOptions = config?.inputs.some(
    (input) =>
      input.required &&
      (input.inputType === "choice" || input.inputType === "environment") &&
      input.options.length === 0
  );

  function changeOpen(nextOpen: boolean) {
    if (mutation.isPending) return;
    if (nextOpen) setWorkflowId(initialWorkflowId ?? null);
    setOpen(nextOpen);
    if (nextOpen) {
      mutation.reset();
      setFieldErrors({});
    }
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!config || selectedWorkflowId === null || !selectedReference || !config.dispatchable)
      return;
    const prepared = prepareWorkflowDispatchInputs(config, draft);
    setFieldErrors(prepared.errors);
    if (Object.keys(prepared.errors).length > 0) return;
    mutation.mutate({
      ...repositoryTarget,
      workflowId: selectedWorkflowId,
      reference: selectedReference,
      inputs: prepared.inputs,
    });
  }

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm" disabled={disabled}>
          <Play data-icon="inline-start" />
          {t("workspace.repositories.runWorkflow")}
        </Button>
      </DialogTrigger>
      <DialogContent
        className="flex max-h-[calc(100dvh-2rem)] min-h-0 flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl"
        showCloseButton={!mutation.isPending}
        aria-busy={mutation.isPending}
      >
        <form className="flex min-h-0 flex-1 flex-col" onSubmit={submit}>
          <DialogHeader className="px-6 pt-6">
            <DialogTitle>{t("workspace.repositories.runWorkflow")}</DialogTitle>
            <DialogDescription>
              {t("workspace.repositories.runWorkflowDescription")}
            </DialogDescription>
          </DialogHeader>

          <div className="grid min-h-0 flex-1 grid-rows-[minmax(0,1fr)] overflow-hidden">
            <ScrollArea className="min-h-0">
              <div className="flex flex-col gap-5 px-6 py-1 pb-6">
                {optionsResult.isPending ? <DispatchLoading /> : null}

                {optionsError ? (
                  <Alert variant="destructive">
                    <CircleAlert />
                    <AlertTitle>
                      {t(
                        optionsError.code === "githubPermission"
                          ? "workspace.repositories.workflowPermissionDenied"
                          : "workspace.repositories.workflowDispatchOptionsLoadFailed"
                      )}
                    </AlertTitle>
                    <AlertDescription className="gap-3">
                      <span>{optionsError.message}</span>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => void optionsResult.refetch()}
                      >
                        <RefreshCw data-icon="inline-start" />
                        {t("workspace.repositories.retry")}
                      </Button>
                    </AlertDescription>
                  </Alert>
                ) : null}

                {!optionsResult.isPending &&
                !optionsError &&
                (workflows.length === 0 || !references.length) ? (
                  <Empty className="min-h-48">
                    <EmptyHeader>
                      <EmptyMedia variant="icon">
                        <Play />
                      </EmptyMedia>
                      <EmptyTitle>
                        {t(
                          workflows.length === 0
                            ? "workspace.repositories.noActiveWorkflows"
                            : "workspace.repositories.noWorkflowReferences"
                        )}
                      </EmptyTitle>
                      <EmptyDescription>
                        {t(
                          workflows.length === 0
                            ? "workspace.repositories.noActiveWorkflowsDescription"
                            : "workspace.repositories.noWorkflowReferencesDescription"
                        )}
                      </EmptyDescription>
                    </EmptyHeader>
                  </Empty>
                ) : null}

                {workflows.length > 0 && references.length > 0 ? (
                  <FieldGroup className="gap-5">
                    <Field>
                      <FieldLabel htmlFor="workflow-dispatch-workflow">
                        {t("workspace.repositories.workflow")}
                      </FieldLabel>
                      <Select
                        key={`workflow:${selectedWorkflowId ?? "none"}`}
                        value={selectedWorkflowId === null ? "" : String(selectedWorkflowId)}
                        disabled={mutation.isPending}
                        onValueChange={(value) => {
                          setWorkflowId(Number(value));
                          setFieldErrors({});
                          mutation.reset();
                        }}
                      >
                        <SelectTrigger id="workflow-dispatch-workflow" className="w-full">
                          <SelectValue
                            className="min-w-0 flex-1 text-left"
                            placeholder={t("workspace.repositories.workflowPlaceholder")}
                          />
                        </SelectTrigger>
                        <SelectContent position="popper">
                          <SelectGroup>
                            {workflows.map((workflow) => (
                              <SelectItem key={workflow.id} value={String(workflow.id)}>
                                {workflow.name}
                              </SelectItem>
                            ))}
                          </SelectGroup>
                        </SelectContent>
                      </Select>
                    </Field>

                    <Field>
                      <FieldLabel htmlFor="workflow-dispatch-reference">
                        {t("workspace.repositories.workflowReference")}
                      </FieldLabel>
                      <Select
                        key={`reference:${selectedReference}`}
                        value={selectedReference}
                        disabled={mutation.isPending}
                        onValueChange={(value) => {
                          setReference(value);
                          setFieldErrors({});
                          mutation.reset();
                        }}
                      >
                        <SelectTrigger id="workflow-dispatch-reference" className="w-full">
                          <SelectValue
                            className="min-w-0 flex-1 text-left"
                            placeholder={t("workspace.repositories.workflowReferencePlaceholder")}
                          />
                        </SelectTrigger>
                        <SelectContent position="popper">
                          {branches.length ? (
                            <SelectGroup>
                              <SelectLabel>
                                {t("workspace.repositories.workflowBranches")}
                              </SelectLabel>
                              {branches.map((candidate) => (
                                <SelectItem key={`branch:${candidate.name}`} value={candidate.name}>
                                  <GitBranch />
                                  {candidate.name}
                                </SelectItem>
                              ))}
                            </SelectGroup>
                          ) : null}
                          {tags.length ? (
                            <SelectGroup>
                              <SelectLabel>{t("workspace.repositories.workflowTags")}</SelectLabel>
                              {tags.map((candidate) => (
                                <SelectItem key={`tag:${candidate.name}`} value={candidate.name}>
                                  <Tag />
                                  {candidate.name}
                                </SelectItem>
                              ))}
                            </SelectGroup>
                          ) : null}
                        </SelectContent>
                      </Select>
                      <FieldDescription>
                        {t("workspace.repositories.workflowReferenceDescription")}
                      </FieldDescription>
                    </Field>
                  </FieldGroup>
                ) : null}

                {configResult.isPending && selectedWorkflowId !== null && selectedReference ? (
                  <div className="flex flex-col gap-3">
                    <Skeleton className="h-4 w-20" />
                    <Skeleton className="h-9 w-full" />
                    <Skeleton className="h-9 w-full" />
                  </div>
                ) : null}

                {configError ? (
                  <Alert variant="destructive">
                    <CircleAlert />
                    <AlertTitle>
                      {t("workspace.repositories.workflowDispatchDefinitionLoadFailed")}
                    </AlertTitle>
                    <AlertDescription className="gap-3">
                      <span>{configError.message}</span>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => void configResult.refetch()}
                      >
                        <RefreshCw data-icon="inline-start" />
                        {t("workspace.repositories.retry")}
                      </Button>
                    </AlertDescription>
                  </Alert>
                ) : null}

                {config && !config.dispatchable ? (
                  <Alert>
                    <CircleAlert />
                    <AlertTitle>
                      {t("workspace.repositories.workflowDispatchUnavailable")}
                    </AlertTitle>
                    <AlertDescription>
                      {t("workspace.repositories.workflowDispatchUnavailableDescription")}
                    </AlertDescription>
                  </Alert>
                ) : null}

                {config?.dispatchable && config.inputs.length > 0 ? (
                  <FieldSet>
                    <FieldLegend>{t("workspace.repositories.workflowInputs")}</FieldLegend>
                    <FieldGroup className="gap-5">
                      {config.inputs.map((definition, index) => (
                        <DispatchField
                          key={definition.name}
                          definition={definition}
                          index={index}
                          value={draft[definition.name]}
                          error={fieldErrors[definition.name]}
                          disabled={mutation.isPending}
                          onChange={(value) => {
                            setDraft((current) => ({ ...current, [definition.name]: value }));
                            setFieldErrors((current) => {
                              if (!(definition.name in current)) return current;
                              const next = { ...current };
                              delete next[definition.name];
                              return next;
                            });
                            mutation.reset();
                          }}
                        />
                      ))}
                    </FieldGroup>
                  </FieldSet>
                ) : null}

                {unavailableRequiredOptions ? (
                  <Alert>
                    <CircleAlert />
                    <AlertTitle>
                      {t("workspace.repositories.workflowDispatchRequiredOptionsUnavailable")}
                    </AlertTitle>
                    <AlertDescription>
                      {t(
                        "workspace.repositories.workflowDispatchRequiredOptionsUnavailableDescription"
                      )}
                    </AlertDescription>
                  </Alert>
                ) : null}

                {dispatchError ? (
                  <Alert variant="destructive">
                    <CircleAlert />
                    <AlertTitle>{t("workspace.repositories.workflowDispatchFailed")}</AlertTitle>
                    <AlertDescription>
                      {dispatchError.code === "githubPermission"
                        ? t("workspace.repositories.workflowRunWritePermissionDenied")
                        : dispatchError.message}
                    </AlertDescription>
                  </Alert>
                ) : null}
              </div>
            </ScrollArea>
          </div>

          <DialogFooter className="border-t px-6 py-4">
            <Button
              type="button"
              variant="outline"
              disabled={mutation.isPending}
              onClick={() => changeOpen(false)}
            >
              {t("workspace.repositories.cancel")}
            </Button>
            <Button
              type="submit"
              disabled={
                mutation.isPending ||
                !config?.dispatchable ||
                Boolean(configError) ||
                Boolean(unavailableRequiredOptions)
              }
            >
              {mutation.isPending ? (
                <Spinner data-icon="inline-start" />
              ) : (
                <Play data-icon="inline-start" />
              )}
              {mutation.isPending
                ? t("workspace.repositories.runningWorkflow")
                : t("workspace.repositories.runWorkflow")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
