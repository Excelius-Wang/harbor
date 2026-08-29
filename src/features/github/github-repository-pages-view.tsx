import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowLeft,
  ExternalLink,
  GitBranch,
  Globe2,
  History,
  RefreshCw,
  Rocket,
  ShieldCheck,
  Trash2,
  Workflow,
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
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
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
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
  FieldTitle,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { parseIpcError } from "@/lib/ipc-error";
import { openExternalUrl } from "@/lib/window";
import type {
  GitHubPagesBuild,
  GitHubPagesBuildType,
  GitHubPagesConfiguration,
  GitHubPagesDomainHealth,
  GitHubPagesMutation,
  GitHubPagesSite,
  GitHubRepository,
} from "./github-data";
import { formatIssueDate, GitHubPagination } from "./github-issue-shared";
import { repositoryPagesHealthQueryOptions, repositoryPagesQueryOptions } from "./github-queries";
import {
  mutateRepositoryPages,
  refreshRepositoryPages,
  syncRepositoryPages,
} from "./github-repository-pages";

type StatusBadgeVariant = "default" | "secondary" | "destructive" | "outline";

function statusBadgeVariant(status: string): StatusBadgeVariant {
  switch (status.toLowerCase()) {
    case "built":
    case "approved":
    case "verified":
      return "secondary";
    case "errored":
    case "error":
    case "failed":
    case "cancelled":
      return "destructive";
    case "building":
    case "queued":
    case "pending":
      return "default";
    default:
      return "outline";
  }
}

function isBuildActive(build: GitHubPagesBuild | undefined) {
  return build ? ["queued", "building", "pending"].includes(build.status.toLowerCase()) : false;
}

function configurationFromSite(
  site: GitHubPagesSite | undefined,
  defaultBranch: string
): GitHubPagesConfiguration {
  return site
    ? {
        buildType: site.buildType,
        branch: site.buildType === "legacy" ? (site.source?.branch ?? defaultBranch) : null,
        sourcePath: site.buildType === "legacy" ? (site.source?.path ?? "root") : null,
        customDomain: site.customDomain ?? null,
        httpsEnforced: site.httpsEnforced,
      }
    : {
        buildType: "legacy",
        branch: defaultBranch,
        sourcePath: "root",
        customDomain: null,
        httpsEnforced: false,
      };
}

function formatDuration(milliseconds: number | undefined, locale: string) {
  if (milliseconds === undefined) return "";
  const seconds = Math.max(0, Math.round(milliseconds / 1_000));
  if (seconds < 60) return `${new Intl.NumberFormat(locale).format(seconds)}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${new Intl.NumberFormat(locale).format(minutes)}m ${new Intl.NumberFormat(locale).format(remainingSeconds)}s`;
}

function PagesSkeleton({ onBack }: { onBack: () => void }) {
  const { t } = useTranslation();
  return (
    <ScrollArea className="min-h-0 flex-1" constrainContentWidth>
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-4 p-5 pb-10">
        <Button variant="ghost" size="sm" className="self-start" onClick={onBack}>
          <ArrowLeft data-icon="inline-start" />
          {t("workspace.repositories.settings.pages.back")}
        </Button>
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-72 w-full" />
      </div>
    </ScrollArea>
  );
}

function StatusBadge({ status }: { status: string }) {
  const { t } = useTranslation();
  return (
    <Badge variant={statusBadgeVariant(status)}>
      {t(`workspace.repositories.settings.pages.statuses.${status.toLowerCase()}`, {
        defaultValue: status,
      })}
    </Badge>
  );
}

function BooleanBadge({ value }: { value: boolean }) {
  const { t } = useTranslation();
  return (
    <Badge variant={value ? "secondary" : "destructive"}>
      {t(
        value
          ? "workspace.repositories.settings.pages.healthReady"
          : "workspace.repositories.settings.pages.healthNeedsAttention"
      )}
    </Badge>
  );
}

function PublishingStatus({
  repository,
  site,
  latestBuild,
}: {
  repository: GitHubRepository;
  site: GitHubPagesSite;
  latestBuild: GitHubPagesBuild | undefined;
}) {
  const { t } = useTranslation();
  const source =
    site.buildType === "workflow"
      ? t("workspace.repositories.settings.pages.actionsSource")
      : `${site.source?.branch ?? repository.defaultBranch}${site.source?.path === "docs" ? "/docs" : "/"}`;
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("workspace.repositories.settings.pages.publishStatus")}</CardTitle>
        <CardDescription>
          {t("workspace.repositories.settings.pages.publishStatusDescription")}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid divide-y @min-[720px]/pages:grid-cols-3 @min-[720px]/pages:divide-x @min-[720px]/pages:divide-y-0">
        <div className="flex min-w-0 flex-col gap-2 py-3 @min-[720px]/pages:pr-5">
          <div className="text-muted-foreground flex items-center gap-2 text-xs">
            {site.buildType === "legacy" ? <GitBranch /> : <Workflow />}
            {t("workspace.repositories.settings.pages.source")}
          </div>
          <p className="truncate text-sm font-medium" title={source}>
            {source}
          </p>
        </div>
        <div className="flex min-w-0 flex-col gap-2 py-3 @min-[720px]/pages:px-5">
          <div className="text-muted-foreground flex items-center gap-2 text-xs">
            <Rocket />
            {t("workspace.repositories.settings.pages.deployment")}
          </div>
          <StatusBadge status={latestBuild?.status ?? site.status} />
        </div>
        <div className="flex min-w-0 flex-col gap-2 py-3 @min-[720px]/pages:pl-5">
          <div className="text-muted-foreground flex items-center gap-2 text-xs">
            <Globe2 />
            {t("workspace.repositories.settings.pages.site")}
          </div>
          <Button
            variant="link"
            size="sm"
            className="h-auto min-w-0 self-start px-0"
            onClick={() => void openExternalUrl(site.url)}
          >
            <span className="truncate">{site.url}</span>
            <ExternalLink data-icon="inline-end" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function BuildTypeField({
  value,
  disabled,
  onChange,
}: {
  value: GitHubPagesBuildType;
  disabled: boolean;
  onChange: (value: GitHubPagesBuildType) => void;
}) {
  const { t } = useTranslation();
  return (
    <FieldSet disabled={disabled}>
      <FieldLegend variant="label">
        {t("workspace.repositories.settings.pages.buildType")}
      </FieldLegend>
      <RadioGroup
        value={value}
        className="grid sm:grid-cols-2"
        onValueChange={(next) => onChange(next as GitHubPagesBuildType)}
      >
        <FieldLabel htmlFor="pages-build-type-legacy">
          <Field orientation="horizontal">
            <RadioGroupItem id="pages-build-type-legacy" value="legacy" />
            <FieldContent>
              <FieldTitle>{t("workspace.repositories.settings.pages.branchSource")}</FieldTitle>
              <FieldDescription>
                {t("workspace.repositories.settings.pages.branchSourceDescription")}
              </FieldDescription>
            </FieldContent>
          </Field>
        </FieldLabel>
        <FieldLabel htmlFor="pages-build-type-workflow">
          <Field orientation="horizontal">
            <RadioGroupItem id="pages-build-type-workflow" value="workflow" />
            <FieldContent>
              <FieldTitle>{t("workspace.repositories.settings.pages.actionsSource")}</FieldTitle>
              <FieldDescription>
                {t("workspace.repositories.settings.pages.actionsSourceDescription")}
              </FieldDescription>
            </FieldContent>
          </Field>
        </FieldLabel>
      </RadioGroup>
    </FieldSet>
  );
}

function PagesConfigurationCard({
  enabled,
  archived,
  branches,
  draft,
  canEnableHttps,
  pending,
  onDraftChange,
  onSave,
}: {
  enabled: boolean;
  archived: boolean;
  branches: string[];
  draft: GitHubPagesConfiguration;
  canEnableHttps: boolean;
  pending: boolean;
  onDraftChange: (draft: GitHubPagesConfiguration) => void;
  onSave: () => void;
}) {
  const { t } = useTranslation();
  const disabled = archived || pending;
  const valid = draft.buildType === "workflow" || Boolean(draft.branch?.trim() && draft.sourcePath);
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {t(
            enabled
              ? "workspace.repositories.settings.pages.configuration"
              : "workspace.repositories.settings.pages.enableTitle"
          )}
        </CardTitle>
        <CardDescription>
          {t(
            enabled
              ? "workspace.repositories.settings.pages.configurationDescription"
              : "workspace.repositories.settings.pages.enableDescription"
          )}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <FieldGroup>
          <BuildTypeField
            value={draft.buildType}
            disabled={disabled}
            onChange={(buildType) =>
              onDraftChange({
                ...draft,
                buildType,
                branch: buildType === "legacy" ? (draft.branch ?? branches[0] ?? "") : null,
                sourcePath: buildType === "legacy" ? (draft.sourcePath ?? "root") : null,
              })
            }
          />
          {draft.buildType === "legacy" ? (
            <FieldGroup className="grid gap-4 sm:grid-cols-2">
              <Field data-disabled={disabled}>
                <FieldLabel>{t("workspace.repositories.settings.pages.branch")}</FieldLabel>
                <Select
                  value={draft.branch ?? ""}
                  disabled={disabled}
                  onValueChange={(branch) => onDraftChange({ ...draft, branch })}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder={t("workspace.repositories.settings.pages.branch")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {branches.map((branch) => (
                        <SelectItem key={branch} value={branch}>
                          {branch}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
              <Field data-disabled={disabled}>
                <FieldLabel>{t("workspace.repositories.settings.pages.folder")}</FieldLabel>
                <Select
                  value={draft.sourcePath ?? "root"}
                  disabled={disabled}
                  onValueChange={(sourcePath) =>
                    onDraftChange({
                      ...draft,
                      sourcePath: sourcePath as GitHubPagesConfiguration["sourcePath"],
                    })
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value="root">
                        {t("workspace.repositories.settings.pages.folderRoot")}
                      </SelectItem>
                      <SelectItem value="docs">
                        {t("workspace.repositories.settings.pages.folderDocs")}
                      </SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
            </FieldGroup>
          ) : null}
          {enabled ? (
            <>
              <Field data-disabled={disabled}>
                <FieldLabel htmlFor="pages-custom-domain">
                  {t("workspace.repositories.settings.pages.customDomain")}
                </FieldLabel>
                <Input
                  id="pages-custom-domain"
                  value={draft.customDomain ?? ""}
                  placeholder={t("workspace.repositories.settings.pages.customDomainPlaceholder")}
                  autoComplete="off"
                  disabled={disabled}
                  onChange={(event) =>
                    onDraftChange({
                      ...draft,
                      customDomain: event.currentTarget.value || null,
                      httpsEnforced:
                        event.currentTarget.value === draft.customDomain
                          ? draft.httpsEnforced
                          : false,
                    })
                  }
                />
                <FieldDescription>
                  {t("workspace.repositories.settings.pages.customDomainDescription")}
                </FieldDescription>
              </Field>
              <Field
                orientation="horizontal"
                data-disabled={disabled || (!canEnableHttps && !draft.httpsEnforced)}
              >
                <Checkbox
                  id="pages-enforce-https"
                  checked={draft.httpsEnforced}
                  disabled={disabled || (!canEnableHttps && !draft.httpsEnforced)}
                  onCheckedChange={(checked) =>
                    onDraftChange({ ...draft, httpsEnforced: checked === true })
                  }
                />
                <FieldContent>
                  <FieldLabel htmlFor="pages-enforce-https">
                    {t("workspace.repositories.settings.pages.enforceHttps")}
                  </FieldLabel>
                  <FieldDescription>
                    {t(
                      canEnableHttps || draft.httpsEnforced
                        ? "workspace.repositories.settings.pages.enforceHttpsDescription"
                        : "workspace.repositories.settings.pages.enforceHttpsUnavailable"
                    )}
                  </FieldDescription>
                </FieldContent>
              </Field>
            </>
          ) : null}
        </FieldGroup>
      </CardContent>
      <CardFooter className="justify-end">
        <Button disabled={disabled || !valid} onClick={onSave}>
          {pending ? <Spinner data-icon="inline-start" /> : <Rocket data-icon="inline-start" />}
          {t(
            enabled
              ? "workspace.repositories.settings.pages.save"
              : "workspace.repositories.settings.pages.enable"
          )}
        </Button>
      </CardFooter>
    </Card>
  );
}

function DomainHealthCard({
  health,
  alternateHealth,
  pending,
  error,
  onRetry,
}: {
  health: GitHubPagesDomainHealth | undefined;
  alternateHealth: GitHubPagesDomainHealth | undefined;
  pending: boolean;
  error: unknown;
  onRetry: () => void;
}) {
  const { t } = useTranslation();
  const results = [health, alternateHealth].filter((result): result is GitHubPagesDomainHealth =>
    Boolean(result)
  );
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck /> {t("workspace.repositories.settings.pages.domainHealth")}
        </CardTitle>
        <CardDescription>
          {t("workspace.repositories.settings.pages.domainHealthDescription")}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {pending ? (
          <Alert>
            <Spinner />
            <AlertTitle>{t("workspace.repositories.settings.pages.healthChecking")}</AlertTitle>
            <AlertDescription>
              {t("workspace.repositories.settings.pages.healthCheckingDescription")}
            </AlertDescription>
          </Alert>
        ) : error ? (
          <Alert variant="destructive">
            <AlertTriangle />
            <AlertTitle>{t("workspace.repositories.settings.pages.healthFailed")}</AlertTitle>
            <AlertDescription>
              <p>{parseIpcError(error).message}</p>
              <Button variant="outline" size="sm" onClick={onRetry}>
                <RefreshCw data-icon="inline-start" />
                {t("common.retry")}
              </Button>
            </AlertDescription>
          </Alert>
        ) : results.length > 0 ? (
          results.map((result, index) => {
            const problems = [result.reason, result.httpsError, result.caaError].filter(Boolean);
            return (
              <div key={`${result.host ?? "domain"}-${index}`} className="flex flex-col gap-4">
                {index > 0 ? <Separator /> : null}
                <p className="text-sm font-medium">
                  {result.host ??
                    t(
                      index === 0
                        ? "workspace.repositories.settings.pages.primaryDomain"
                        : "workspace.repositories.settings.pages.alternateDomain"
                    )}
                </p>
                <dl className="grid gap-4 sm:grid-cols-2">
                  <div className="flex items-center justify-between gap-3">
                    <dt className="text-muted-foreground text-xs">
                      {t("workspace.repositories.settings.pages.dnsResolves")}
                    </dt>
                    <dd>
                      <BooleanBadge value={result.dnsResolves} />
                    </dd>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <dt className="text-muted-foreground text-xs">
                      {t("workspace.repositories.settings.pages.domainValid")}
                    </dt>
                    <dd>
                      <BooleanBadge value={result.valid} />
                    </dd>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <dt className="text-muted-foreground text-xs">
                      {t("workspace.repositories.settings.pages.respondsToHttps")}
                    </dt>
                    <dd>
                      <BooleanBadge value={result.respondsToHttps} />
                    </dd>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <dt className="text-muted-foreground text-xs">
                      {t("workspace.repositories.settings.pages.httpsEligible")}
                    </dt>
                    <dd>
                      <BooleanBadge value={result.httpsEligible} />
                    </dd>
                  </div>
                </dl>
                {problems.length > 0 ? (
                  <Alert variant="destructive">
                    <AlertTriangle />
                    <AlertTitle>
                      {t("workspace.repositories.settings.pages.domainProblem")}
                    </AlertTitle>
                    <AlertDescription>
                      {problems.map((problem) => (
                        <p key={problem}>{problem}</p>
                      ))}
                    </AlertDescription>
                  </Alert>
                ) : null}
              </div>
            );
          })
        ) : null}
      </CardContent>
    </Card>
  );
}

function BuildHistory({
  repository,
  builds,
  page,
  hasPrevious,
  hasMore,
  pending,
  onPageChange,
  onRequestBuild,
}: {
  repository: GitHubRepository;
  builds: GitHubPagesBuild[];
  page: number;
  hasPrevious: boolean;
  hasMore: boolean;
  pending: boolean;
  onPageChange: (page: number) => void;
  onRequestBuild: () => void;
}) {
  const { t, i18n } = useTranslation();
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <History /> {t("workspace.repositories.settings.pages.buildHistory")}
        </CardTitle>
        <CardDescription>
          {t("workspace.repositories.settings.pages.buildHistoryDescription")}
        </CardDescription>
      </CardHeader>
      <CardContent className="px-0">
        {builds.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <History />
              </EmptyMedia>
              <EmptyTitle>{t("workspace.repositories.settings.pages.noBuilds")}</EmptyTitle>
              <EmptyDescription>
                {t("workspace.repositories.settings.pages.noBuildsDescription")}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("workspace.repositories.settings.pages.buildStatus")}</TableHead>
                <TableHead>{t("workspace.repositories.settings.pages.commit")}</TableHead>
                <TableHead>{t("workspace.repositories.settings.pages.triggeredBy")}</TableHead>
                <TableHead>{t("workspace.repositories.settings.pages.started")}</TableHead>
                <TableHead>{t("workspace.repositories.settings.pages.duration")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {builds.map((build, index) => (
                <TableRow
                  key={build.url ?? `${build.commit ?? "build"}-${build.createdAt ?? index}`}
                >
                  <TableCell>
                    <div className="flex max-w-56 flex-col gap-1">
                      <StatusBadge status={build.status} />
                      {build.error ? (
                        <span className="text-destructive text-xs whitespace-normal">
                          {build.error}
                        </span>
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell>
                    {build.commit ? (
                      <Button
                        variant="link"
                        size="xs"
                        className="px-0 font-mono"
                        onClick={() =>
                          void openExternalUrl(
                            `${repository.url}/commit/${encodeURIComponent(build.commit!)}`
                          )
                        }
                      >
                        {build.commit.slice(0, 7)}
                        <ExternalLink data-icon="inline-end" />
                      </Button>
                    ) : (
                      t("workspace.repositories.settings.pages.notAvailable")
                    )}
                  </TableCell>
                  <TableCell>
                    {build.pusher ?? t("workspace.repositories.settings.pages.notAvailable")}
                  </TableCell>
                  <TableCell>{formatIssueDate(build.createdAt, i18n.language)}</TableCell>
                  <TableCell>
                    {formatDuration(build.durationMilliseconds, i18n.language) ||
                      t("workspace.repositories.settings.pages.notAvailable")}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        <GitHubPagination
          page={page}
          hasPrevious={hasPrevious}
          hasMore={hasMore}
          onPageChange={onPageChange}
          ariaLabel={t("workspace.repositories.settings.pages.buildPagination")}
        />
      </CardContent>
      <CardFooter className="justify-end">
        <Button variant="outline" disabled={pending} onClick={onRequestBuild}>
          {pending ? <Spinner data-icon="inline-start" /> : <RefreshCw data-icon="inline-start" />}
          {t("workspace.repositories.settings.pages.requestBuild")}
        </Button>
      </CardFooter>
    </Card>
  );
}

export function GitHubRepositoryPagesView({
  repository,
  branches,
  onBack,
}: {
  repository: GitHubRepository;
  branches: string[];
  onBack: () => void;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const target = { owner: repository.owner, repository: repository.name };
  const availableBranches = useMemo(
    () => [...new Set([repository.defaultBranch, ...branches])].filter(Boolean),
    [branches, repository.defaultBranch]
  );
  const [page, setPage] = useState(1);
  const pagesResult = useQuery({
    ...repositoryPagesQueryOptions({ ...target, page }),
    refetchInterval: (query) => {
      const workspace = query.state.data;
      return workspace?.site?.status.toLowerCase() === "building" ||
        isBuildActive(workspace?.builds[0])
        ? 5_000
        : false;
    },
  });
  const workspace = pagesResult.data;
  const site = workspace?.site;
  const [draft, setDraft] = useState(() =>
    configurationFromSite(undefined, repository.defaultBranch)
  );
  const [disableOpen, setDisableOpen] = useState(false);
  const [disableConfirmation, setDisableConfirmation] = useState("");
  const healthResult = useQuery({
    ...repositoryPagesHealthQueryOptions(target),
    enabled: Boolean(site?.customDomain),
    refetchInterval: (query) => (query.state.data?.pending ? 3_000 : false),
  });

  useEffect(() => {
    setDraft(configurationFromSite(site, repository.defaultBranch));
  }, [
    repository.defaultBranch,
    repository.id,
    site?.buildType,
    site?.customDomain,
    site?.httpsEnforced,
    site?.source?.branch,
    site?.source?.path,
  ]);

  useEffect(() => {
    setPage(1);
    setDisableOpen(false);
    setDisableConfirmation("");
  }, [repository.id]);

  const mutation = useMutation({
    mutationFn: (next: GitHubPagesMutation) => mutateRepositoryPages(target, next),
    onSuccess: (next, requested) => {
      syncRepositoryPages(queryClient, target, next);
      setPage(1);
      if (requested.action === "disable") {
        setDisableOpen(false);
        setDisableConfirmation("");
      }
      void refreshRepositoryPages(queryClient, target);
      toast.success(
        t(
          requested.action === "requestBuild"
            ? "workspace.repositories.settings.pages.buildRequested"
            : requested.action === "disable"
              ? "workspace.repositories.settings.pages.disabled"
              : "workspace.repositories.settings.pages.saved"
        )
      );
    },
    onError: (error) =>
      toast.error(t("workspace.repositories.settings.pages.updateFailed"), {
        description: parseIpcError(error).message,
      }),
  });

  if (pagesResult.isPending) return <PagesSkeleton onBack={onBack} />;

  const latestBuild = workspace?.builds[0];
  const archived = workspace?.isArchived ?? repository.isArchived;
  const domainUnchanged = (draft.customDomain?.trim() || null) === (site?.customDomain ?? null);
  const domainHealth = healthResult.data?.domain;
  const alternateDomainHealth = healthResult.data?.alternateDomain;
  const canEnableHttps =
    !draft.customDomain ||
    (domainUnchanged &&
      (site?.httpsEnforced ||
        site?.certificate?.state.toLowerCase() === "approved" ||
        domainHealth?.httpsEligible === true));
  const pendingAction = mutation.variables?.action;

  return (
    <ScrollArea className="min-h-0 flex-1" constrainContentWidth>
      <div className="@container/pages mx-auto flex w-full max-w-4xl flex-col gap-4 p-5 pb-10">
        <Button variant="ghost" size="sm" className="self-start" onClick={onBack}>
          <ArrowLeft data-icon="inline-start" />
          {t("workspace.repositories.settings.pages.back")}
        </Button>
        <div>
          <h3 className="text-base font-semibold tracking-[-0.02em]">
            {t("workspace.repositories.settings.pages.title")}
          </h3>
          <p className="text-muted-foreground mt-1 text-xs">
            {t("workspace.repositories.settings.pages.workspaceDescription", {
              repository: repository.fullName,
            })}
          </p>
        </div>

        {pagesResult.isError ? (
          <Alert variant="destructive">
            <AlertTriangle />
            <AlertTitle>{t("workspace.repositories.settings.pages.loadFailed")}</AlertTitle>
            <AlertDescription>
              <p>{parseIpcError(pagesResult.error).message}</p>
              <Button variant="outline" size="sm" onClick={() => void pagesResult.refetch()}>
                <RefreshCw data-icon="inline-start" />
                {t("common.retry")}
              </Button>
            </AlertDescription>
          </Alert>
        ) : null}

        {archived ? (
          <Alert>
            <AlertTriangle />
            <AlertTitle>{t("workspace.repositories.settings.pages.archivedTitle")}</AlertTitle>
            <AlertDescription>
              {t("workspace.repositories.settings.pages.archivedDescription")}
            </AlertDescription>
          </Alert>
        ) : null}

        {site ? (
          <PublishingStatus repository={repository} site={site} latestBuild={latestBuild} />
        ) : null}

        {!pagesResult.isError && workspace ? (
          <PagesConfigurationCard
            enabled={Boolean(site)}
            archived={archived}
            branches={availableBranches}
            draft={draft}
            canEnableHttps={canEnableHttps}
            pending={mutation.isPending && pendingAction === "configure"}
            onDraftChange={setDraft}
            onSave={() => mutation.mutate({ action: "configure", configuration: draft })}
          />
        ) : null}

        {site?.customDomain ? (
          <DomainHealthCard
            health={domainHealth}
            alternateHealth={alternateDomainHealth}
            pending={healthResult.isPending || healthResult.data?.pending === true}
            error={healthResult.error}
            onRetry={() => void healthResult.refetch()}
          />
        ) : null}

        {site?.buildType === "legacy" && workspace ? (
          <BuildHistory
            repository={repository}
            builds={workspace.builds}
            page={workspace.page}
            hasPrevious={workspace.hasPrevious}
            hasMore={workspace.hasMore}
            pending={mutation.isPending && pendingAction === "requestBuild"}
            onPageChange={setPage}
            onRequestBuild={() => mutation.mutate({ action: "requestBuild" })}
          />
        ) : null}

        {site?.buildType === "workflow" ? (
          <Alert>
            <Workflow />
            <AlertTitle>{t("workspace.repositories.settings.pages.actionsBuildTitle")}</AlertTitle>
            <AlertDescription>
              <p>{t("workspace.repositories.settings.pages.actionsBuildDescription")}</p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => void openExternalUrl(`${repository.url}/actions`)}
              >
                {t("workspace.repositories.settings.pages.openActions")}
                <ExternalLink data-icon="inline-end" />
              </Button>
            </AlertDescription>
          </Alert>
        ) : null}

        {site ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-destructive">
                {t("workspace.repositories.settings.pages.disableTitle")}
              </CardTitle>
              <CardDescription>
                {t("workspace.repositories.settings.pages.disableDescription")}
              </CardDescription>
            </CardHeader>
            <CardFooter className="justify-end">
              <Button
                variant="destructive"
                disabled={archived}
                onClick={() => setDisableOpen(true)}
              >
                <Trash2 data-icon="inline-start" />
                {t("workspace.repositories.settings.pages.disable")}
              </Button>
            </CardFooter>
          </Card>
        ) : null}
      </div>

      <AlertDialog
        open={disableOpen}
        onOpenChange={(open) => {
          if (!mutation.isPending) setDisableOpen(open);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("workspace.repositories.settings.pages.disableConfirmTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("workspace.repositories.settings.pages.disableConfirmDescription", {
                repository: repository.fullName,
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Field>
            <FieldLabel htmlFor="pages-disable-confirmation">
              {t("workspace.repositories.settings.pages.disableConfirmationLabel", {
                repository: repository.fullName,
              })}
            </FieldLabel>
            <Input
              id="pages-disable-confirmation"
              value={disableConfirmation}
              autoComplete="off"
              disabled={mutation.isPending}
              onChange={(event) => setDisableConfirmation(event.currentTarget.value)}
            />
          </Field>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={mutation.isPending}>
              {t("common.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={
                disableConfirmation !== repository.fullName ||
                (mutation.isPending && pendingAction === "disable")
              }
              onClick={(event) => {
                event.preventDefault();
                mutation.mutate({ action: "disable", confirmation: disableConfirmation });
              }}
            >
              {mutation.isPending && pendingAction === "disable" ? (
                <Spinner data-icon="inline-start" />
              ) : (
                <Trash2 data-icon="inline-start" />
              )}
              {t("workspace.repositories.settings.pages.disable")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ScrollArea>
  );
}
