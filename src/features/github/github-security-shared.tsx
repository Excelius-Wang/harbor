import { CircleCheck, CircleDot, ShieldAlert } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { GitHubSecurityAlertSummary } from "./github-data";

export function securityAlertIsOpen(alert: GitHubSecurityAlertSummary) {
  return alert.state === "open";
}

export function securityAlertCanReopen(alert: GitHubSecurityAlertSummary) {
  return (
    alert.state === "dismissed" || alert.state === "resolved" || alert.state === "auto_dismissed"
  );
}

export function SecurityStateBadge({ alert }: { alert: GitHubSecurityAlertSummary }) {
  const { t } = useTranslation();
  const open = securityAlertIsOpen(alert);
  const Icon = open ? CircleDot : CircleCheck;
  return (
    <Badge
      variant="outline"
      className={cn(
        "h-6 rounded-md px-2 font-medium",
        open
          ? "border-destructive/35 bg-destructive/10 text-destructive"
          : "bg-secondary text-secondary-foreground"
      )}
    >
      <Icon data-icon="inline-start" />
      {t(`workspace.security.states.${alert.state}`, { defaultValue: alert.state })}
    </Badge>
  );
}

export function SecuritySeverityBadge({ severity }: { severity: string }) {
  const { t } = useTranslation();
  const normalized = severity.toLocaleLowerCase();
  return (
    <Badge
      variant="outline"
      className={cn(
        "h-6 rounded-md px-2 font-medium",
        normalized === "critical" && "border-destructive/50 bg-destructive/15 text-destructive",
        normalized === "high" && "border-destructive/30 bg-destructive/8 text-destructive",
        normalized === "medium" && "border-primary/35 bg-primary/10 text-primary",
        normalized === "low" && "border-success/35 bg-success/10 text-success",
        !["critical", "high", "medium", "low"].includes(normalized) &&
          "bg-secondary text-secondary-foreground"
      )}
    >
      <ShieldAlert data-icon="inline-start" />
      {t(`workspace.security.severities.${normalized}`, { defaultValue: severity })}
    </Badge>
  );
}

export function severityRailClass(alert: GitHubSecurityAlertSummary) {
  if (alert.kind === "secretScanning") {
    return alert.validity === "active" ? "bg-destructive" : "bg-muted-foreground/45";
  }
  switch (alert.severity.toLocaleLowerCase()) {
    case "critical":
      return "bg-destructive";
    case "high":
      return "bg-destructive/65";
    case "medium":
      return "bg-primary";
    case "low":
      return "bg-success";
    default:
      return "bg-muted-foreground/45";
  }
}
