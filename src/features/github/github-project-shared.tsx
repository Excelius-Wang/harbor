import { CircleDot, GitPullRequest, Lightbulb, Lock, type LucideIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type {
  GitHubProjectFieldOption,
  GitHubProjectFieldValue,
  GitHubProjectItem,
} from "./github-data";

export function projectItemTitle(item: GitHubProjectItem) {
  return item.content.kind === "redacted" ? "" : item.content.title;
}

export function projectItemIcon(item: GitHubProjectItem): LucideIcon {
  switch (item.content.kind) {
    case "issue":
      return CircleDot;
    case "pullRequest":
      return GitPullRequest;
    case "draftIssue":
    case "redacted":
      return Lightbulb;
  }
}

export function projectItemRepository(item: GitHubProjectItem) {
  return item.content.kind === "issue" || item.content.kind === "pullRequest"
    ? item.content.repository.fullName
    : null;
}

export function projectFieldValue(item: GitHubProjectItem, fieldId: string) {
  return item.fieldValues.find((value) => value.fieldId === fieldId);
}

export function projectFieldValueText(value: GitHubProjectFieldValue | undefined) {
  if (!value) return "";
  switch (value.kind) {
    case "text":
      return value.text;
    case "number":
      return String(value.number);
    case "date":
      return value.date;
    case "singleSelect":
      return value.name;
    case "multiSelect":
      return value.options.map((option) => option.name).join(", ");
    case "iteration":
      return value.title;
    case "labels":
      return value.labels.map((label) => label.name).join(", ");
    case "users":
      return value.users.map((user) => user.login).join(", ");
    case "milestone":
      return value.title;
    case "repository":
      return value.fullName;
  }
}

export function projectOptionTone(color: string) {
  switch (color.toLowerCase()) {
    case "green":
      return "border-success/35 bg-success/10 text-success";
    case "red":
      return "border-destructive/35 bg-destructive/10 text-destructive";
    case "yellow":
    case "orange":
      return "border-primary/35 bg-primary/10 text-primary";
    case "blue":
    case "pink":
    case "purple":
      return "border-primary/25 bg-primary/8 text-primary";
    default:
      return "border-border bg-muted/45 text-muted-foreground";
  }
}

export function projectOptionRail(color: string) {
  switch (color.toLowerCase()) {
    case "green":
      return "bg-success";
    case "red":
      return "bg-destructive";
    case "yellow":
    case "orange":
      return "bg-primary/70";
    case "blue":
    case "pink":
    case "purple":
      return "bg-primary";
    default:
      return "bg-muted-foreground/45";
  }
}

export function ProjectOptionBadge({ option }: { option: GitHubProjectFieldOption }) {
  return (
    <Badge
      variant="outline"
      className={cn("h-5 rounded-md px-1.5 font-normal", projectOptionTone(option.color))}
    >
      {option.name}
    </Badge>
  );
}

export function ProjectVisibilityBadge({ isPublic }: { isPublic: boolean }) {
  const { t } = useTranslation();
  return (
    <Badge variant="outline" className="h-5 rounded-md px-1.5 font-normal">
      {isPublic ? null : <Lock data-icon="inline-start" />}
      {t(isPublic ? "workspace.projects.public" : "workspace.projects.private")}
    </Badge>
  );
}
