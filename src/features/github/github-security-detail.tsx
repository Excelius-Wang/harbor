import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  CircleAlert,
  ExternalLink,
  FileCode2,
  KeyRound,
  RefreshCw,
  RotateCcw,
  ShieldAlert,
} from "lucide-react";
import { useTranslation } from "react-i18next";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { parseIpcError } from "@/lib/ipc-error";
import { openExternalUrl } from "@/lib/window";
import type {
  GitHubCodeScanningAlertDetail,
  GitHubCodeScanningDismissReason,
  GitHubDependabotAlertDetail,
  GitHubDependabotDismissReason,
  GitHubRepository,
  GitHubSecretScanningResolution,
  GitHubSecretScanningAlertDetail,
  GitHubSecurityAlertDetail as GitHubSecurityAlertDetailData,
  GitHubSecurityAlertKind,
  GitHubSecurityAlertMutation,
} from "./github-data";
import { formatIssueDate, GitHubPagination } from "./github-issue-shared";
import {
  codeScanningInstancesQueryOptions,
  secretScanningLocationsQueryOptions,
  securityAlertQueryOptions,
} from "./github-queries";
import {
  invalidateGitHubSecurityAlert,
  reconcileGitHubSecurityAlert,
  updateGitHubSecurityAlert,
} from "./github-security-mutations";
import {
  securityAlertCanReopen,
  securityAlertIsOpen,
  SecuritySeverityBadge,
  SecurityStateBadge,
} from "./github-security-shared";

export function GitHubSecurityAlertDetail({
  repository,
  kind,
  alertNumber,
  backLabel,
  onBack,
}: {
  repository: GitHubRepository;
  kind: GitHubSecurityAlertKind;
  alertNumber: number;
  backLabel: string;
  onBack: () => void;
}) {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const [actionOpen, setActionOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [comment, setComment] = useState("");
  const result = useQuery(
    securityAlertQueryOptions({
      owner: repository.owner,
      repository: repository.name,
      kind,
      alertNumber,
    })
  );
  const detail = result.data;
  const mutation = useMutation({
    mutationFn: updateGitHubSecurityAlert,
    onSuccess: (nextDetail) => {
      reconcileGitHubSecurityAlert(queryClient, repository, nextDetail);
      setActionOpen(false);
      setReason("");
      setComment("");
      toast.success(t("workspace.security.updateSuccess"));
      void invalidateGitHubSecurityAlert(
        queryClient,
        repository,
        nextDetail.kind,
        nextDetail.alert.number
      );
    },
  });
  const mutationError = mutation.error ? parseIpcError(mutation.error) : null;

  if (result.isPending) {
    return <SecurityDetailSkeleton />;
  }

  if (!detail || result.error) {
    const error = parseIpcError(result.error);
    return (
      <Empty className="min-h-80 flex-1">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <CircleAlert />
          </EmptyMedia>
          <EmptyTitle>{t("workspace.security.detailLoadFailed")}</EmptyTitle>
          <EmptyDescription>
            {error.code === "githubPermission" || error.code === "githubSecurityUnavailable"
              ? t("workspace.security.permissionDescription")
              : error.message}
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onBack}>
              <ArrowLeft data-icon="inline-start" />
              {backLabel}
            </Button>
            <Button variant="outline" onClick={() => void result.refetch()}>
              <RefreshCw data-icon="inline-start" />
              {t("workspace.repositories.retry")}
            </Button>
          </div>
        </EmptyContent>
      </Empty>
    );
  }

  const open = securityAlertIsOpen(detail.alert);
  const canReopen = securityAlertCanReopen(detail.alert);
  const canUpdate = open || canReopen;
  const closeReasonOptions = securityReasonOptions(detail.kind);

  const submitMutation = () => {
    const nextState = open ? "closed" : "open";
    mutation.mutate({
      owner: repository.owner,
      name: repository.name,
      alertNumber,
      mutation: buildSecurityMutation(detail.kind, nextState, reason, comment),
    });
  };

  return (
    <section className="flex min-h-0 min-w-0 flex-1 flex-col">
      <header className="flex shrink-0 flex-wrap items-start justify-between gap-3 border-b border-white/[0.065] px-4 py-3">
        <div className="flex min-w-0 items-start gap-2.5">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={backLabel}
            onClick={onBack}
          >
            <ArrowLeft />
          </Button>
          <div className="flex min-w-0 flex-col gap-2">
            <div className="flex min-w-0 flex-wrap items-center gap-1.5">
              <SecurityStateBadge alert={detail.alert} />
              {detail.alert.kind !== "secretScanning" ? (
                <SecuritySeverityBadge severity={detail.alert.severity} />
              ) : (
                <Badge variant="outline" className="h-6 rounded-md px-2">
                  {t(`workspace.security.validity.${detail.alert.validity}`, {
                    defaultValue: detail.alert.validity,
                  })}
                </Badge>
              )}
              <Badge variant="outline" className="h-6 rounded-md px-2 font-normal">
                {t("workspace.security.alertNumber", { number: alertNumber })}
              </Badge>
            </div>
            <h2 className="max-w-[70ch] text-base leading-6 font-semibold tracking-[-0.015em]">
              {detail.alert.title}
            </h2>
            <span className="text-muted-foreground text-[10px]">
              {t(`workspace.security.kinds.${detail.kind}`)}
              {" · "}
              {formatIssueDate(detail.alert.updatedAt ?? detail.alert.createdAt, i18n.language)}
            </span>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {canUpdate ? (
            <Button
              type="button"
              variant={open ? "destructive" : "outline"}
              size="sm"
              disabled={repository.isArchived}
              onClick={() => {
                setReason("");
                setComment("");
                mutation.reset();
                setActionOpen(true);
              }}
            >
              {open ? (
                <ShieldAlert data-icon="inline-start" />
              ) : (
                <RotateCcw data-icon="inline-start" />
              )}
              {t(open ? "workspace.security.closeAction" : "workspace.security.reopenAction")}
            </Button>
          ) : null}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void openExternalUrl(detail.alert.url)}
          >
            <ExternalLink data-icon="inline-end" />
            {t("workspace.openOnGitHub")}
          </Button>
        </div>
      </header>

      {repository.isArchived ? (
        <Alert className="rounded-none border-x-0 border-t-0">
          <CircleAlert />
          <AlertTitle>{t("workspace.security.archivedTitle")}</AlertTitle>
          <AlertDescription>{t("workspace.security.archivedDescription")}</AlertDescription>
        </Alert>
      ) : null}

      <ScrollArea className="min-h-0 flex-1">
        <div className="mx-auto flex w-full max-w-[980px] flex-col gap-5 px-5 py-5">
          {detail.kind === "dependabot" ? (
            <DependabotDetail detail={detail} locale={i18n.language} />
          ) : detail.kind === "codeScanning" ? (
            <CodeScanningDetail repository={repository} detail={detail} locale={i18n.language} />
          ) : (
            <SecretScanningDetail repository={repository} detail={detail} locale={i18n.language} />
          )}
        </div>
      </ScrollArea>

      <AlertDialog open={actionOpen} onOpenChange={setActionOpen}>
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t(open ? "workspace.security.closeTitle" : "workspace.security.reopenTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t(
                open
                  ? "workspace.security.closeDescription"
                  : "workspace.security.reopenDescription",
                { title: detail.alert.title }
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {open ? (
            <div className="flex flex-col gap-3">
              <label className="flex flex-col gap-2 text-xs font-medium">
                {t("workspace.security.reason")}
                <Select value={reason} onValueChange={setReason}>
                  <SelectTrigger className="w-full" aria-label={t("workspace.security.reason")}>
                    <SelectValue placeholder={t("workspace.security.selectReason")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {closeReasonOptions.map((option) => (
                        <SelectItem key={option} value={option}>
                          {t(`workspace.security.reasons.${detail.kind}.${option}`)}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </label>
              <label className="flex flex-col gap-2 text-xs font-medium">
                {t("workspace.security.comment")}
                <Textarea
                  value={comment}
                  maxLength={1000}
                  onChange={(event) => setComment(event.currentTarget.value)}
                  placeholder={t("workspace.security.commentPlaceholder")}
                  className="min-h-24 resize-y"
                />
              </label>
              <span className="text-muted-foreground text-right text-[10px]">
                {t("workspace.security.commentCount", { count: comment.length })}
              </span>
            </div>
          ) : null}
          {mutationError ? (
            <Alert variant="destructive">
              <CircleAlert />
              <AlertTitle>{t("workspace.security.updateFailed")}</AlertTitle>
              <AlertDescription>
                {mutationError.code === "githubPermission"
                  ? t("workspace.security.writePermissionDescription")
                  : mutationError.message}
              </AlertDescription>
            </Alert>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={mutation.isPending}>
              {t("workspace.notifications.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              variant={open ? "destructive" : "default"}
              disabled={mutation.isPending || (open && !reason)}
              onClick={(event) => {
                event.preventDefault();
                submitMutation();
              }}
            >
              {mutation.isPending ? (
                <Spinner data-icon="inline-start" />
              ) : open ? (
                <ShieldAlert data-icon="inline-start" />
              ) : (
                <RotateCcw data-icon="inline-start" />
              )}
              {t(open ? "workspace.security.closeAction" : "workspace.security.reopenAction")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

function DependabotDetail({
  detail,
  locale,
}: {
  detail: GitHubDependabotAlertDetail;
  locale: string;
}) {
  const { t } = useTranslation();
  const metrics = [
    {
      label: t("workspace.security.fields.package"),
      value: `${detail.alert.ecosystem} / ${detail.alert.packageName}`,
    },
    { label: t("workspace.security.fields.manifest"), value: detail.alert.manifestPath },
    {
      label: t("workspace.security.fields.vulnerableRange"),
      value: detail.vulnerableVersionRange,
    },
    {
      label: t("workspace.security.fields.patchedVersion"),
      value: detail.firstPatchedVersion ?? t("workspace.security.notAvailable"),
    },
    {
      label: t("workspace.security.fields.cvss"),
      value: detail.cvssScore?.toFixed(1) ?? t("workspace.security.notAvailable"),
    },
    {
      label: t("workspace.security.fields.epss"),
      value:
        detail.epssPercentage === undefined
          ? t("workspace.security.notAvailable")
          : new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 2 }).format(
              detail.epssPercentage
            ),
    },
  ];
  return (
    <>
      <DetailSection title={t("workspace.security.sections.summary")}>
        <p className="text-muted-foreground max-w-[78ch] text-sm leading-6 whitespace-pre-wrap">
          {detail.description}
        </p>
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline" className="rounded-md">
            {detail.ghsaId}
          </Badge>
          {detail.cveId ? (
            <Badge variant="outline" className="rounded-md">
              {detail.cveId}
            </Badge>
          ) : null}
        </div>
      </DetailSection>
      <DetailSection title={t("workspace.security.sections.risk")}>
        <DefinitionGrid items={metrics} />
        {detail.cvssVector ? (
          <code className="text-muted-foreground block overflow-x-auto rounded-md bg-black/15 px-3 py-2 text-[11px]">
            {detail.cvssVector}
          </code>
        ) : null}
      </DetailSection>
      {detail.cwes.length ? (
        <DetailSection title={t("workspace.security.sections.weaknesses")}>
          <div className="flex flex-wrap gap-2">
            {detail.cwes.map((cwe) => (
              <Badge key={cwe.id} variant="secondary" className="rounded-md font-normal">
                {cwe.id}: {cwe.name}
              </Badge>
            ))}
          </div>
        </DetailSection>
      ) : null}
      {detail.references.length ? (
        <DetailSection title={t("workspace.security.sections.references")}>
          <div className="flex flex-col gap-1.5">
            {detail.references.map((reference) => (
              <Button
                key={reference}
                type="button"
                variant="ghost"
                className="h-auto min-w-0 justify-start px-2 py-1.5 text-left text-xs whitespace-normal"
                onClick={() => void openExternalUrl(reference)}
              >
                <span className="min-w-0 flex-1 truncate">{reference}</span>
                <ExternalLink data-icon="inline-end" />
              </Button>
            ))}
          </div>
        </DetailSection>
      ) : null}
      <ResolutionSection detail={detail} locale={locale} />
    </>
  );
}

function CodeScanningDetail({
  repository,
  detail,
  locale,
}: {
  repository: GitHubRepository;
  detail: GitHubCodeScanningAlertDetail;
  locale: string;
}) {
  const { t } = useTranslation();
  const [page, setPage] = useState(1);
  const instances = useQuery(
    codeScanningInstancesQueryOptions({
      owner: repository.owner,
      repository: repository.name,
      alertNumber: detail.alert.number,
      page,
    })
  );
  return (
    <>
      <DetailSection title={t("workspace.security.sections.summary")}>
        <p className="text-muted-foreground max-w-[78ch] text-sm leading-6 whitespace-pre-wrap">
          {detail.description}
        </p>
        <DefinitionGrid
          items={[
            {
              label: t("workspace.security.fields.rule"),
              value: detail.alert.ruleId ?? detail.alert.title,
            },
            { label: t("workspace.security.fields.tool"), value: detail.alert.toolName },
            {
              label: t("workspace.security.fields.location"),
              value: detail.alert.path
                ? `${detail.alert.path}${detail.alert.startLine ? `:${detail.alert.startLine}` : ""}`
                : t("workspace.security.notAvailable"),
            },
            {
              label: t("workspace.security.fields.reference"),
              value: detail.alert.reference ?? t("workspace.security.notAvailable"),
            },
          ]}
        />
      </DetailSection>
      {detail.help ? (
        <DetailSection title={t("workspace.security.sections.remediation")}>
          <p className="text-muted-foreground max-w-[78ch] text-sm leading-6 whitespace-pre-wrap">
            {detail.help}
          </p>
          {detail.helpUrl ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void openExternalUrl(detail.helpUrl!)}
            >
              <ExternalLink data-icon="inline-end" />
              {t("workspace.security.openRuleHelp")}
            </Button>
          ) : null}
        </DetailSection>
      ) : null}
      <DetailSection title={t("workspace.security.sections.instances")}>
        {instances.isPending ? (
          <EvidenceSkeleton />
        ) : instances.error || !instances.data ? (
          <EvidenceError onRetry={() => void instances.refetch()} />
        ) : instances.data.instances.length ? (
          <div className="overflow-hidden rounded-md border border-white/[0.07]">
            {instances.data.instances.map((instance, index) => (
              <div
                key={`${instance.commitSha}-${instance.path}-${instance.startLine}-${index}`}
                className="flex min-w-0 gap-3 border-b border-white/[0.06] px-3 py-3 last:border-b-0"
              >
                <FileCode2 className="text-muted-foreground mt-0.5 size-4 shrink-0" />
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="truncate text-xs font-medium">
                    {instance.path}:{instance.startLine}
                    {instance.endLine !== instance.startLine ? `-${instance.endLine}` : ""}
                  </span>
                  <span className="text-muted-foreground line-clamp-2 text-[11px] leading-4">
                    {instance.message}
                  </span>
                  <span className="text-muted-foreground truncate font-mono text-[10px]">
                    {instance.reference} · {instance.commitSha.slice(0, 12)}
                  </span>
                </div>
              </div>
            ))}
            <GitHubPagination
              page={instances.data.page}
              hasPrevious={instances.data.hasPrevious}
              hasMore={instances.data.hasMore}
              onPageChange={setPage}
              ariaLabel={t("workspace.security.instancePagination")}
            />
          </div>
        ) : (
          <p className="text-muted-foreground text-xs">{t("workspace.security.noInstances")}</p>
        )}
      </DetailSection>
      <ResolutionSection detail={detail} locale={locale} />
    </>
  );
}

function SecretScanningDetail({
  repository,
  detail,
  locale,
}: {
  repository: GitHubRepository;
  detail: GitHubSecretScanningAlertDetail;
  locale: string;
}) {
  const { t } = useTranslation();
  const [page, setPage] = useState(1);
  const locations = useQuery(
    secretScanningLocationsQueryOptions({
      owner: repository.owner,
      repository: repository.name,
      alertNumber: detail.alert.number,
      page,
    })
  );
  return (
    <>
      <Alert className="border-primary/20 bg-primary/5">
        <KeyRound />
        <AlertTitle>{t("workspace.security.secretHiddenTitle")}</AlertTitle>
        <AlertDescription>{t("workspace.security.secretHiddenDescription")}</AlertDescription>
      </Alert>
      <DetailSection title={t("workspace.security.sections.summary")}>
        <DefinitionGrid
          items={[
            { label: t("workspace.security.fields.secretType"), value: detail.alert.secretType },
            {
              label: t("workspace.security.fields.validity"),
              value: t(`workspace.security.validity.${detail.alert.validity}`, {
                defaultValue: detail.alert.validity,
              }),
            },
            {
              label: t("workspace.security.fields.publiclyLeaked"),
              value: t(
                detail.alert.publiclyLeaked ? "workspace.security.yes" : "workspace.security.no"
              ),
            },
            {
              label: t("workspace.security.fields.multiRepo"),
              value: t(detail.alert.multiRepo ? "workspace.security.yes" : "workspace.security.no"),
            },
            {
              label: t("workspace.security.fields.pushProtectionBypassed"),
              value: t(
                detail.pushProtectionBypassed ? "workspace.security.yes" : "workspace.security.no"
              ),
            },
            {
              label: t("workspace.security.fields.assignee"),
              value: detail.alert.assignee?.login ?? t("workspace.security.unassigned"),
            },
          ]}
        />
      </DetailSection>
      {detail.metadata.length ? (
        <DetailSection title={t("workspace.security.sections.metadata")}>
          <DefinitionGrid
            items={detail.metadata.map((metadata) => ({
              label: metadata.key,
              value: metadata.value,
            }))}
          />
        </DetailSection>
      ) : null}
      <DetailSection title={t("workspace.security.sections.locations")}>
        {locations.isPending ? (
          <EvidenceSkeleton />
        ) : locations.error || !locations.data ? (
          <EvidenceError onRetry={() => void locations.refetch()} />
        ) : locations.data.locations.length ? (
          <div className="overflow-hidden rounded-md border border-white/[0.07]">
            {locations.data.locations.map((location, index) => (
              <div
                key={`${location.kind}-${location.commitSha ?? location.url ?? index}`}
                className="flex min-w-0 gap-3 border-b border-white/[0.06] px-3 py-3 last:border-b-0"
              >
                <KeyRound className="text-muted-foreground mt-0.5 size-4 shrink-0" />
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="text-xs font-medium">
                    {t(`workspace.security.locationKinds.${location.kind}`, {
                      defaultValue: location.kind,
                    })}
                  </span>
                  {location.path ? (
                    <span className="text-muted-foreground truncate text-[11px]">
                      {location.path}
                      {location.startLine ? `:${location.startLine}` : ""}
                    </span>
                  ) : null}
                  {location.commitSha ? (
                    <span className="text-muted-foreground font-mono text-[10px]">
                      {location.commitSha.slice(0, 12)}
                    </span>
                  ) : null}
                </div>
              </div>
            ))}
            <GitHubPagination
              page={locations.data.page}
              hasPrevious={locations.data.hasPrevious}
              hasMore={locations.data.hasMore}
              onPageChange={setPage}
              ariaLabel={t("workspace.security.locationPagination")}
            />
          </div>
        ) : (
          <p className="text-muted-foreground text-xs">{t("workspace.security.noLocations")}</p>
        )}
      </DetailSection>
      <ResolutionSection detail={detail} locale={locale} />
    </>
  );
}

function ResolutionSection({
  detail,
  locale,
}: {
  detail: GitHubSecurityAlertDetailData;
  locale: string;
}) {
  const { t } = useTranslation();
  const resolution =
    detail.kind === "dependabot"
      ? {
          reason: detail.dismissedReason,
          comment: detail.dismissedComment,
          actor: detail.dismissedBy,
          at: detail.dismissedAt ?? detail.fixedAt ?? detail.autoDismissedAt,
        }
      : detail.kind === "codeScanning"
        ? {
            reason: detail.dismissedReason,
            comment: detail.dismissedComment,
            actor: detail.dismissedBy,
            at: detail.dismissedAt ?? detail.fixedAt,
          }
        : {
            reason: detail.resolution,
            comment: detail.resolutionComment,
            actor: detail.resolvedBy,
            at: detail.resolvedAt,
          };
  if (!resolution.reason && !resolution.comment && !resolution.at) return null;
  return (
    <DetailSection title={t("workspace.security.sections.resolution")}>
      <DefinitionGrid
        items={[
          {
            label: t("workspace.security.fields.reason"),
            value: resolution.reason
              ? t(`workspace.security.serverReasons.${resolution.reason}`, {
                  defaultValue: resolution.reason,
                })
              : t("workspace.security.notAvailable"),
          },
          {
            label: t("workspace.security.fields.updatedBy"),
            value: resolution.actor?.login ?? t("workspace.security.notAvailable"),
          },
          {
            label: t("workspace.security.fields.updatedAt"),
            value: resolution.at
              ? formatIssueDate(resolution.at, locale)
              : t("workspace.security.notAvailable"),
          },
        ]}
      />
      {resolution.comment ? (
        <p className="text-muted-foreground rounded-md border border-white/[0.07] bg-white/[0.02] px-3 py-2 text-xs leading-5 whitespace-pre-wrap">
          {resolution.comment}
        </p>
      ) : null}
    </DetailSection>
  );
}

function DetailSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h3 className="text-sm font-semibold tracking-[-0.01em]">{title}</h3>
      <Separator />
      {children}
    </section>
  );
}

function DefinitionGrid({ items }: { items: { label: string; value: string }[] }) {
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-3 min-[760px]:grid-cols-2">
      {items.map((item) => (
        <div key={`${item.label}-${item.value}`} className="flex min-w-0 flex-col gap-1">
          <dt className="text-muted-foreground text-[10px] font-medium">{item.label}</dt>
          <dd className="text-foreground text-xs leading-5 break-words">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function EvidenceSkeleton() {
  return (
    <div className="flex flex-col gap-2">
      <Skeleton className="h-14 w-full" />
      <Skeleton className="h-14 w-full" />
    </div>
  );
}

function EvidenceError({ onRetry }: { onRetry: () => void }) {
  const { t } = useTranslation();
  return (
    <Alert variant="destructive">
      <CircleAlert />
      <AlertTitle>{t("workspace.security.evidenceLoadFailed")}</AlertTitle>
      <AlertDescription>
        <Button variant="outline" size="sm" onClick={onRetry}>
          <RefreshCw data-icon="inline-start" />
          {t("workspace.repositories.retry")}
        </Button>
      </AlertDescription>
    </Alert>
  );
}

function SecurityDetailSkeleton() {
  return (
    <div className="flex flex-1 flex-col">
      <div className="flex gap-3 border-b px-4 py-4">
        <Skeleton className="size-8" />
        <div className="flex flex-1 flex-col gap-2">
          <Skeleton className="h-5 w-2/5" />
          <Skeleton className="h-4 w-4/5" />
        </div>
      </div>
      <div className="flex flex-col gap-5 p-5">
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-36 w-full" />
      </div>
    </div>
  );
}

function securityReasonOptions(kind: GitHubSecurityAlertKind) {
  switch (kind) {
    case "dependabot":
      return ["fixStarted", "inaccurate", "noBandwidth", "notUsed", "tolerableRisk"];
    case "codeScanning":
      return ["falsePositive", "wontFix", "usedInTests", "mitigated"];
    case "secretScanning":
      return ["falsePositive", "wontFix", "revoked", "usedInTests"];
  }
}

function buildSecurityMutation(
  kind: GitHubSecurityAlertKind,
  state: "open" | "closed",
  reason: string,
  comment: string
): GitHubSecurityAlertMutation {
  switch (kind) {
    case "dependabot":
      return {
        kind,
        state,
        reason: state === "closed" ? (reason as GitHubDependabotDismissReason) : undefined,
        comment,
      };
    case "codeScanning":
      return {
        kind,
        state,
        reason: state === "closed" ? (reason as GitHubCodeScanningDismissReason) : undefined,
        comment,
      };
    case "secretScanning":
      return {
        kind,
        state,
        reason: state === "closed" ? (reason as GitHubSecretScanningResolution) : undefined,
        comment,
      };
  }
}
