import type { ComponentProps, MouseEvent } from "react";
import { CheckCircle2, ChevronLeft, ChevronRight, CircleDot } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
} from "@/components/ui/pagination";
import { cn } from "@/lib/utils";
import type { GitHubIssueState } from "./github-data";

export function formatIssueDate(value: string | undefined, locale: string) {
  if (!value) return "";
  return new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export function GitHubIssueStateBadge({ state }: { state: GitHubIssueState }) {
  const { t } = useTranslation();
  const Icon = state === "open" ? CircleDot : CheckCircle2;
  return (
    <Badge
      variant="outline"
      className={cn(
        "h-6 rounded-md px-2 font-medium",
        state === "open"
          ? "border-primary/30 bg-primary/10 text-primary"
          : "bg-secondary text-secondary-foreground"
      )}
    >
      <Icon />
      {t(`workspace.repositories.${state}`)}
    </Badge>
  );
}

export function GitHubIssueLabelBadge({ name, color }: { name: string; color: string }) {
  return (
    <Badge variant="outline" className="h-5 rounded-md px-1.5 font-normal">
      <span
        className="size-1.5 rounded-full"
        style={{ backgroundColor: `#${color}` }}
        aria-hidden="true"
      />
      {name}
    </Badge>
  );
}

export function GitHubPagination({
  page,
  hasPrevious,
  hasMore,
  onPageChange,
  ariaLabel,
}: {
  page: number;
  hasPrevious: boolean;
  hasMore: boolean;
  onPageChange: (page: number) => void;
  ariaLabel: string;
}) {
  const { t } = useTranslation();
  if (!hasPrevious && !hasMore) return null;

  const navigate = (event: MouseEvent<HTMLAnchorElement>, enabled: boolean, nextPage: number) => {
    event.preventDefault();
    if (enabled) onPageChange(nextPage);
  };

  return (
    <Pagination aria-label={ariaLabel} className="border-border/50 border-t px-4 py-3">
      <PaginationContent>
        <PaginationItem>
          <PaginationLink
            href="#"
            size="default"
            aria-disabled={!hasPrevious}
            tabIndex={hasPrevious ? 0 : -1}
            className={cn("gap-1 px-2.5", !hasPrevious && "pointer-events-none opacity-50")}
            onClick={(event) => navigate(event, hasPrevious, page - 1)}
          >
            <ChevronLeft data-icon="inline-start" />
            {t("workspace.repositories.previousPage")}
          </PaginationLink>
        </PaginationItem>
        <PaginationItem>
          <PaginationLink
            href="#"
            size="default"
            isActive
            aria-disabled="true"
            tabIndex={-1}
            onClick={(event) => event.preventDefault()}
          >
            {t("workspace.repositories.pageNumber", { page })}
          </PaginationLink>
        </PaginationItem>
        <PaginationItem>
          <PaginationLink
            href="#"
            size="default"
            aria-disabled={!hasMore}
            tabIndex={hasMore ? 0 : -1}
            className={cn("gap-1 px-2.5", !hasMore && "pointer-events-none opacity-50")}
            onClick={(event) => navigate(event, hasMore, page + 1)}
          >
            {t("workspace.repositories.nextPage")}
            <ChevronRight data-icon="inline-end" />
          </PaginationLink>
        </PaginationItem>
      </PaginationContent>
    </Pagination>
  );
}

export function GitHubIssuePagination(
  props: Omit<ComponentProps<typeof GitHubPagination>, "ariaLabel">
) {
  const { t } = useTranslation();
  return <GitHubPagination {...props} ariaLabel={t("workspace.repositories.issuePagination")} />;
}
